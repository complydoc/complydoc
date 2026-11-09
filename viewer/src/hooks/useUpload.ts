import { useCallback, useEffect, useRef, useState } from "react";
import { localConfig } from "./useLocalReports";

/** A document to send, and where it sits in what was dropped: `annex/prices.pdf`. */
export interface Dropped {
  file: File;
  path: string;
}

/** What was dropped or chosen: the documents to send, the name a folder gives them, what was left out. */
export interface Picked {
  documents: Dropped[];
  /** The folder's name, when one folder was dropped or chosen. */
  name: string;
  /** Files the server does not read, or hidden ones, left out. */
  skipped: number;
}

export interface UploadState {
  phase: "idle" | "sending" | "reading" | "done" | "failed";
  name: string;
  /** Where the server keeps the documents, on this machine. */
  folder: string;
  sent: number;
  files: number;
  done: number;
  total: number;
  /** The document being read now. */
  current: string;
  error?: string;
}

interface Status {
  id: string;
  name: string;
  folder: string;
  state: "receiving" | "waiting" | "reading" | "done" | "failed";
  files: number;
  done: number;
  total: number;
  current: string;
  error: string;
  report: string | null;
}

const IDLE: UploadState = { phase: "idle", name: "", folder: "", sent: 0, files: 0, done: 0, total: 0, current: "" };

/** Whether the server that served the page takes documents: `complydoc ui` on this machine, allowed to write. */
export function takesUploads(): boolean {
  return Boolean(localConfig()?.uploads);
}

/** Keeps the documents the server reads, and splits off what it does not. */
export function pick(files: Dropped[]): Picked {
  const types = new Set(localConfig()?.documentTypes ?? []);
  const documents = files.filter(({ path }) => {
    const parts = path.split("/");
    const name = parts.at(-1) ?? "";
    const dot = name.lastIndexOf(".");
    return !parts.some((part) => part.startsWith(".")) && dot > 0 && types.has(name.slice(dot).toLowerCase());
  });
  // One folder, dropped or chosen whole, names the upload and is not repeated in each path.
  const tops = new Set(documents.map(({ path }) => (path.includes("/") ? path.split("/")[0] : "")));
  const [top] = tops;
  const name = tops.size === 1 && top ? top : "";
  return {
    documents: name ? documents.map((d) => ({ ...d, path: d.path.slice(name.length + 1) })) : documents,
    name,
    skipped: files.length - documents.length,
  };
}

/** Files chosen with a file input; a folder input gives each its path inside the folder. */
export function fromInput(files: FileList | null): Dropped[] {
  return [...(files ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

/** Files dropped on the page, walking into any folder among them. */
export async function fromDrop(transfer: DataTransfer): Promise<Dropped[]> {
  // The entries must be taken before the first await: the browser empties the drop after it.
  const entries = [...transfer.items].map((item) => item.webkitGetAsEntry?.() ?? null);
  if (entries.every((entry) => entry === null)) return fromInput(transfer.files);
  const found: Dropped[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      found.push({ file, path: entry.fullPath.replace(/^\/+/, "") });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // A folder is read in batches, until one comes back empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) return;
      for (const child of batch) await walk(child);
    }
  };
  for (const entry of entries) if (entry) await walk(entry);
  return found;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  });

/**
 * Sends documents to `complydoc ui`, which copies them to this machine and audits them, and
 * hands over the report when it is written. Kept at the top of the page, so closing the
 * screen it was started from does not stop it.
 */
export function useUpload(onReport: (report: { name: string; text: string; source: string }) => void) {
  const [state, setState] = useState<UploadState>(IDLE);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(
    async ({ documents, name }: Picked) => {
      const config = localConfig();
      if (!config?.uploads || !documents.length) return;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const { signal } = controller;
      const asked = async (url: string, init: RequestInit = {}) => {
        const response = await fetch(url, { ...init, signal });
        if (!response.ok) throw new Error((await response.text()) || `${response.status} ${response.statusText}`);
        return response;
      };
      const post = async (url: string, body: object) =>
        (await (
          await asked(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        ).json()) as Status;
      try {
        let status = await post(config.uploads, { name });
        const at = `${config.uploads}/${status.id}`;
        setState({ ...IDLE, phase: "sending", name: status.name, folder: status.folder, files: documents.length });
        for (const [index, { file, path }] of documents.entries()) {
          const where = path.split("/").map(encodeURIComponent).join("/");
          await asked(`${at}/files/${where}`, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: file,
          });
          setState((s) => ({ ...s, sent: index + 1 }));
        }
        status = await post(`${at}/audit`, {});
        while (status.state !== "done" && status.state !== "failed") {
          const { done, total, current } = status;
          setState((s) => ({ ...s, phase: "reading", done, total: total || s.files, current }));
          await wait(1000, signal);
          status = (await (await asked(at)).json()) as Status;
        }
        if (status.state === "failed") throw new Error(status.error || "The audit stopped.");
        const list = (await (await asked(config.reports)).json()) as {
          reports: { id: string; name: string; url: string }[];
        };
        const listed = list.reports.find((r) => r.id === status.report);
        if (!listed) throw new Error("The report was written, but the viewer cannot find it. Reload the page.");
        const text = await (await asked(listed.url)).text();
        const { done, total } = status;
        setState((s) => ({ ...s, phase: "done", done, total, current: "" }));
        onReport({ name: listed.name, text, source: listed.url });
      } catch (error) {
        if (signal.aborted) return;
        setState((s) => ({ ...s, phase: "failed", error: error instanceof Error ? error.message : String(error) }));
      }
    },
    [onReport],
  );

  const reset = useCallback(() => setState(IDLE), []);
  return { state, start, reset };
}

export type Uploader = ReturnType<typeof useUpload>;
