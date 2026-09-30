import { useEffect, useState } from "react";
import { mergeParts, type DocumentPart } from "@/report/parts";
import type { DocumentEntry, Report } from "@/report/types";
import { useReportSource } from "./useFolderRuns";

/** A document's page text and layout, as far as they could be had. */
export type FullDocument =
  | { state: "ready"; document: DocumentEntry }
  | { state: "loading" | "elsewhere" | "failed"; document: DocumentEntry }
  | { state: "missing"; document?: undefined };

/** Each document's file, fetched once however often the document is opened. */
const fetched = new Map<string, Promise<DocumentPart>>();
const merged = new WeakMap<DocumentEntry, { key: string; document: DocumentEntry }>();

function load(url: string): Promise<DocumentPart> {
  let part = fetched.get(url);
  if (!part) {
    part = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json() as Promise<DocumentPart>;
    });
    // A failure is not kept, so opening the document again asks again.
    part.catch(() => fetched.delete(url));
    fetched.set(url, part);
  }
  return part;
}

/**
 * The document at `index` of `report`, whole. A large report keeps each document's page
 * text and layout beside it; `complydoc ui` serves that file, fetched here when the
 * document is first opened. A report opened as a file in the browser has it `elsewhere`.
 */
export function useFullDocument(report: Report, index: number | undefined): FullDocument {
  const source = useReportSource();
  const document = index === undefined ? undefined : report.documents[index];
  const url = document?.parts && source ? `${source}/files/${document.parts}` : null;
  const [part, setPart] = useState<{ url: string; part: DocumentPart | null } | null>(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    load(url).then(
      (found) => alive && setPart({ url, part: found }),
      () => alive && setPart({ url, part: null }),
    );
    return () => {
      alive = false;
    };
  }, [url]);

  if (!document) return { state: "missing" };
  if (!document.parts) return { state: "ready", document };
  if (!url) return { state: "elsewhere", document };
  if (part?.url !== url) return { state: "loading", document };
  if (!part.part) return { state: "failed", document };
  // The same merged document each time, so what is worked out from it is kept.
  const known = merged.get(document);
  if (known?.key === url) return { state: "ready", document: known.document };
  const whole = mergeParts(document, part.part);
  merged.set(document, { key: url, document: whole });
  return { state: "ready", document: whole };
}

/** `report` with its document at `index` replaced by `document`. */
export function withDocument(report: Report, index: number, document: DocumentEntry): Report {
  if (report.documents[index] === document) return report;
  return { ...report, documents: report.documents.map((entry, i) => (i === index ? document : entry)) };
}
