/**
 * Several reports open at once, as the folders they audited.
 *
 * A collection is a folder and everything under it, which is what one audit
 * covers. Reports of the same folder are its runs, newest first, so the
 * viewer can say what changed between one run and the one before.
 */
import { measured } from "./measured";
import { fileName } from "./format";
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
      name: fileName(folder) || folder,
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

export interface RunChange {
  /**
   * Each figure before and after, or null where the two runs cannot be compared:
   * one did not measure it, or, for readiness, the two were scored from different
   * parts. A figure a run did not measure is not zero, and a drop to it is not news.
   */
  readiness: { before: number | null; after: number | null } | null;
  sensitive: { before: number; after: number } | null;
  hidden: { before: number; after: number } | null;
  /** Documents in the newer run that the older did not have, and the other way round. */
  added: string[];
  removed: string[];
  /** Documents in both runs whose figures moved, the largest change first. */
  documents: DocumentChange[];
}

/** One document's figures in two runs, each null where the two cannot be compared. */
export interface DocumentChange {
  path: string;
  identifiers: { before: number; after: number } | null;
  readiness: { before: number; after: number } | null;
}

/** Documents whose identifiers or readiness changed between two runs that measured them alike. */
function documentChanges(newer: Report, older: Report, scanned: boolean, sameScoring: boolean): DocumentChange[] {
  const before = new Map(older.documents.map((d) => [d.relative_path, d]));
  const changes: DocumentChange[] = [];
  for (const document of newer.documents) {
    const then = before.get(document.relative_path);
    if (!then) continue;
    const identifiers = scanned
      ? { before: then.sensitive.matches.length, after: document.sensitive.matches.length }
      : null;
    const scoreThen = older.overall.by_document[document.relative_path];
    const scoreNow = newer.overall.by_document[document.relative_path];
    const readiness =
      sameScoring && scoreThen !== undefined && scoreNow !== undefined ? { before: scoreThen, after: scoreNow } : null;
    // A point of readiness either way is noise in how a score rounds, not a change to act on.
    const moved =
      (identifiers && identifiers.after !== identifiers.before) ||
      (readiness && Math.abs(readiness.after - readiness.before) >= 1);
    if (moved) changes.push({ path: document.relative_path, identifiers, readiness });
  }
  const size = (c: DocumentChange) =>
    Math.abs((c.identifiers?.after ?? 0) - (c.identifiers?.before ?? 0)) * 100 +
    Math.abs((c.readiness?.after ?? 0) - (c.readiness?.before ?? 0));
  return changes.sort((a, b) => size(b) - size(a) || a.path.localeCompare(b.path));
}

/** What changed from one run of a folder to a later one. */
export function changeBetween(newer: Report, older: Report): RunChange {
  const paths = (report: Report) => new Set(report.documents.map((d) => d.relative_path));
  const now = paths(newer);
  const then = paths(older);
  const scanned = measured(newer, "sensitive") && measured(older, "sensitive");
  // Readiness is scored from the parts a run measured, so two runs of different parts give
  // scores of different things.
  const parts = (report: Report) => [...(report.run.components_run ?? [])].sort().join(",");
  const sameScoring = parts(newer) === parts(older) && measured(newer, "readiness");
  return {
    readiness: sameScoring ? { before: older.overall.score, after: newer.overall.score } : null,
    sensitive: scanned
      ? { before: older.aggregate.sensitive_total, after: newer.aggregate.sensitive_total }
      : null,
    hidden: scanned
      ? { before: older.aggregate.content_findings_total, after: newer.aggregate.content_findings_total }
      : null,
    added: [...now].filter((p) => !then.has(p)).sort(),
    removed: [...then].filter((p) => !now.has(p)).sort(),
    documents: documentChanges(newer, older, scanned, sameScoring),
  };
}

/**
 * What kind of run a report is, from what it holds: "Audit", "Cost", "Chunks" and so
 * on. Several runs of one folder are otherwise told apart only by when they started.
 */
export function runKind(report: Report): string {
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

/** When a run started, as a person reads it. */
export function runLabel(report: Report): string {
  const started = new Date(report.run.started_at);
  if (Number.isNaN(started.getTime())) return report.run.started_at || "unknown time";
  return started.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
