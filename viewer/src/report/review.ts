import type { FindingRow } from "./security";
import type { Report } from "./types";

/**
 * Reviewing findings one at a time, as an annotation queue works through runs: each is
 * kept as a real finding or ignored with a reason. Ignoring writes the folder's ignore
 * file; keeping is remembered in this browser, per folder, by the finding's fingerprint,
 * so it holds across runs of the folder as the ignore file does.
 */

/** Where this browser keeps what was reviewed in a folder. */
export function reviewKey(report: Report): string {
  return `complydoc-reviewed:${report.run.target}`;
}

export function readKept(key: string): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeKept(key: string, kept: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...kept].sort()));
  } catch {
    // Storage off, as in a private window: kept for this visit only.
  }
}

/**
 * What a finding is kept by. Its fingerprint, the same in every run; a report written
 * before fingerprints has none, so the finding is known by where it is and what it is.
 */
export function reviewId(row: FindingRow): string {
  return row.source.fingerprint ?? `${row.path}|${row.label}|${row.masked}|${row.page ?? ""}`;
}

export interface Progress {
  total: number;
  kept: number;
  ignored: number;
  reviewed: number;
}

export function progressOf(
  rows: FindingRow[],
  kept: Set<string>,
  isIgnored: (fingerprint: string) => boolean,
): Progress {
  let keptCount = 0;
  let ignoredCount = 0;
  for (const row of rows) {
    const fingerprint = row.source.fingerprint;
    if (fingerprint && isIgnored(fingerprint)) ignoredCount += 1;
    else if (kept.has(reviewId(row))) keptCount += 1;
  }
  return { total: rows.length, kept: keptCount, ignored: ignoredCount, reviewed: keptCount + ignoredCount };
}

/** The next finding after `from` not yet kept or ignored, going round; null when all are. */
export function nextUnreviewed(rows: FindingRow[], from: number, isDone: (row: FindingRow) => boolean): number | null {
  for (let step = 1; step <= rows.length; step += 1) {
    const index = (from + step) % rows.length;
    const row = rows[index];
    if (row && !isDone(row)) return index;
  }
  return null;
}

export interface Context {
  before: string | null;
  /** The line the finding is on, cut where the finding starts and ends. */
  line: { lead: string; hit: string; tail: string };
  after: string | null;
}

/**
 * The finding in the page's masked text, with a line either side. Masking keeps a value's
 * length, so the finding's place in the text as read is its place in the text as masked.
 * Null where the report kept no page text, or has no place for the finding.
 */
export function contextOf(report: Report, row: FindingRow): Context | null {
  const { line, column, length } = row.source;
  if (line === undefined || column === undefined || length === undefined || row.page === null) return null;
  const page = report.documents[row.document]?.extracted_text.find((p) => p.number === row.page);
  const lines = page?.text.split("\n");
  const text = lines?.[line - 1];
  if (!lines || text === undefined || column + length > text.length) return null;
  return {
    before: lines[line - 2] ?? null,
    line: { lead: text.slice(0, column), hit: text.slice(column, column + length), tail: text.slice(column + length) },
    after: lines[line] ?? null,
  };
}
