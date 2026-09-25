/**
 * Several reports open at once, as the folders they audited.
 *
 * A collection is a folder and everything under it, which is what one audit
 * covers. Reports of the same folder are its runs, newest first, so the
 * viewer can say what changed between one run and the one before.
 */
import { fileName } from "./format";
import type { Report } from "./types";

export interface Loaded {
  /** Unique among the reports open. */
  id: string;
  /** The file it was opened from. */
  name: string;
  report: Report;
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

/**
 * The folder a report audited. An audit names it; a loader comparison names
 * its baseline loader instead, so there it is the folder its documents share.
 */
function folderOf(report: Report): string {
  const target = (report.run.target || "").replace(/[\\/]+$/, "");
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

export interface RunChange {
  readiness: { before: number | null; after: number | null };
  sensitive: { before: number; after: number };
  hidden: { before: number; after: number };
  /** Documents in the newer run that the older did not have, and the other way round. */
  added: string[];
  removed: string[];
}

/** What changed from one run of a folder to a later one. */
export function changeBetween(newer: Report, older: Report): RunChange {
  const paths = (report: Report) => new Set(report.documents.map((d) => d.relative_path));
  const now = paths(newer);
  const then = paths(older);
  return {
    readiness: { before: older.overall.score, after: newer.overall.score },
    sensitive: { before: older.aggregate.sensitive_total, after: newer.aggregate.sensitive_total },
    hidden: { before: older.aggregate.content_findings_total, after: newer.aggregate.content_findings_total },
    added: [...now].filter((p) => !then.has(p)).sort(),
    removed: [...then].filter((p) => !now.has(p)).sort(),
  };
}

/** When a run started, as a person reads it. */
export function runLabel(report: Report): string {
  const started = new Date(report.run.started_at);
  if (Number.isNaN(started.getTime())) return report.run.started_at || "unknown time";
  return started.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
