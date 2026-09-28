/**
 * Several reports open at once, as the folders they audited.
 *
 * A collection is a folder and everything under it, which is what one audit
 * covers. Reports of the same folder are its runs, newest first, so the
 * viewer can say what changed between one run and the one before.
 */
import { fileName } from "./format";
import { identifiersSent } from "./traceView";
import type { Report } from "./types";

export interface Loaded {
  /** Unique among the reports open. */
  id: string;
  /** The file it was opened from. */
  name: string;
  report: Report;
  /** Where `complydoc ui` serves it from, e.g. `api/reports/3f2a…`. Absent for a file opened in the browser. */
  source?: string;
}

export interface Collection {
  /** The folder the runs audited, as the report names it. */
  id: string;
  name: string;
  runs: Loaded[];
}

/** The folder every document sits in, from their paths. Empty when they share none. */
function commonFolder(paths: string[]): string {
  const split = paths.map((path) => path.split(/[\\/]/).slice(0, -1));
  const first = split[0] ?? [];
  let length = first.length;
  for (const parts of split) {
    length = Math.min(length, parts.length);
    while (length > 0 && parts.slice(0, length).join("/") !== first.slice(0, length).join("/")) length -= 1;
  }
  return first.slice(0, length).join("/");
}

/** A path with its `.` and `..` steps taken and no trailing separator, so one folder reads one way. */
function normalised(path: string): string {
  const parts: string[] = [];
  for (const part of path.split(/[\\/]+/)) {
    if (part === ".") continue;
    if (part === ".." && parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/").replace(/\/+$/, "") || (path.startsWith("/") ? "/" : "");
}

/**
 * The folder a report audited. An audit names it; a loader comparison names
 * its baseline loader instead, so there it is the folder its documents share.
 */
function folderOf(report: Report): string {
  // A pipeline's runs go together under its name, as an experiment's runs do: one pipeline
  // can read from several folders, and a folder can feed several pipelines.
  if (report.trace && report.trace.kind !== "audit") return `pipeline:${report.trace.name}`;
  const target = normalised(report.run.target || "");
  if (report.loader_comparison && target === report.loader_comparison.baseline) {
    return commonFolder(report.documents.map((d) => d.relative_path)) || target;
  }
  return target;
}

/** The open reports grouped by the folder each audited, folders by name, runs newest first. */
export function collectionsOf(loaded: Loaded[]): Collection[] {
  const byFolder = new Map<string, Loaded[]>();
  for (const item of loaded) {
    const folder = folderOf(item.report) || item.name;
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), item]);
  }
  return [...byFolder]
    .map(([folder, runs]) => ({
      id: folder,
      name: folder.startsWith("pipeline:") ? folder.slice("pipeline:".length) : fileName(folder) || folder,
      runs: [...runs].sort((a, b) => b.report.run.started_at.localeCompare(a.report.run.started_at)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The run a folder opens on and is summed up by: its newest audit, which measures
 * everything; failing that, its newest run that read documents. A later run of another
 * kind, such as a loader comparison or `complydoc chunks`, is one of its runs, but
 * measures part of the folder or holds no documents to show; only a folder with no
 * other run opens on it.
 */
export function leadRun(collection: Collection): Loaded | undefined {
  return (
    collection.runs.find((run) => runKind(run.report) === "Audit" && run.report.documents.length > 0) ??
    collection.runs.find((run) => run.report.documents.length > 0) ??
    collection.runs[0]
  );
}

/**
 * What kind of run a report is, from what it holds: "Audit", "Cost", "Chunks" and so
 * on. Several runs of one folder are otherwise told apart only by when they started.
 */
export function runKind(report: Report): string {
  if (report.trace && report.trace.kind !== "audit") return "Pipeline";
  if (report.chunks?.length && report.documents.length === 0) return "Chunks";
  if (report.loader_comparison) return "Loader comparison";
  if (report.loader) return "Loader inspection";
  const parts = [...(report.run.components_run ?? [])].sort().join(",");
  const kinds: Record<string, string> = {
    "cost,readiness,sensitive": "Audit",
    cost: "Cost",
    sensitive: "Identifiers",
    readiness: "Readiness",
    "cost,readiness": "Routing",
  };
  return kinds[parts] ?? "Audit";
}

/**
 * What set a run apart from others of its kind, in a few words each: values shown in the
 * clear first, since a report that holds them is to be handled as the documents are.
 */
export function runTraits(report: Report): string[] {
  return [
    report.run.reveal_used && "values revealed",
    report.trace?.kind !== "audit" && report.trace && (identifiersSent(report.trace) ?? 0) > 0 && "identifiers sent",
    report.run.page_images_used && "page pictures",
    report.run.ocr_compare_used && "OCR compared",
    report.verification && "vision checked",
  ].filter((trait): trait is string => Boolean(trait));
}

/** When a run started, as a person reads it. */
export function runLabel(report: Report, seconds = false): string {
  const started = new Date(report.run.started_at);
  if (Number.isNaN(started.getTime())) return report.run.started_at || "unknown time";
  return started.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: seconds ? "medium" : "short" });
}
