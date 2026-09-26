/**
 * What the Home page points an engineer at: the findings that matter most, and
 * the documents worth opening first, each with the reason it is there.
 */
import { findingRows, type FindingRow } from "./security";
import { SIMILAR_ENOUGH, bandOf, documentRows, documentVision, type Tone } from "./select";
import type { Report } from "./types";

export interface Reason {
  label: string;
  tone: Tone;
}

export interface AttentionRow {
  /** Position of the document in the report, to open it. */
  index: number;
  path: string;
  reasons: Reason[];
  /** How much there is to look at: more, and worse, ranks first. */
  weight: number;
}

/**
 * The documents to open first, most to look at first.
 *
 * A hidden instruction outranks everything, then pages a vision model read
 * differently, then readers that disagree, then low readiness, then
 * high-severity identifiers. A document with none of these is not listed.
 */
export function attentionDocuments(report: Report, limit = 6): AttentionRow[] {
  const rows = documentRows(report).map((row) => {
    const document = report.documents[row.index];
    const reasons: Reason[] = [];
    let weight = 0;
    const hidden = document?.content_findings.length ?? 0;
    if (hidden) {
      reasons.push({ label: hidden === 1 ? "hidden instruction" : `${hidden} hidden instructions`, tone: "bad" });
      weight += 16;
    }
    const vision = document ? documentVision(document) : null;
    if (vision && vision.disagree > 0) {
      reasons.push({ label: `vision disputes ${vision.disagree} of ${vision.checked} pages`, tone: "bad" });
      weight += 8;
    }
    if (row.agreement !== null && row.agreement < SIMILAR_ENOUGH) {
      reasons.push({ label: row.reordered ? "readers scramble the order" : "readers disagree", tone: "warn" });
      weight += 4;
    }
    const band = bandOf(row.score);
    if (band === "needs work" || band === "not ready") {
      reasons.push({ label: `readiness ${Math.round(row.score ?? 0)}`, tone: band === "not ready" ? "bad" : "warn" });
      weight += 2;
    }
    const high = document?.sensitive.matches.filter((m) => m.severity === "high").length ?? 0;
    if (high) {
      reasons.push({ label: high === 1 ? "1 high-severity identifier" : `${high} high-severity identifiers`, tone: "bad" });
      weight += 1;
    }
    return { index: row.index, path: row.path, reasons, weight };
  });
  return rows
    .filter((row) => row.reasons.length > 0)
    .sort((a, b) => b.weight - a.weight || a.path.localeCompare(b.path))
    .slice(0, limit);
}

/** One kind of identifier in one document: its strongest value, and how many values and pages it spans. */
export interface TopFinding extends FindingRow {
  /** Different values of this kind in the document. */
  values: number;
}

export interface TopFindings {
  /** The strongest findings, high severity and best evidenced first, one per kind and document. */
  rows: TopFinding[];
  /** High-severity identifiers found, every occurrence counted. */
  high: number;
  /** Of those, the ones proved by a check, such as a checksum. */
  confirmedHigh: number;
}

/**
 * The findings to look at first: high severity only, the surest first. Five
 * National Insurance numbers in one handbook are one line to look at, saying
 * five, not five lines.
 */
export function topFindings(report: Report, limit = 6): TopFindings {
  const high = findingRows(report).filter((row) => row.severity === "high");
  const groups = new Map<string, TopFinding>();
  for (const row of high) {
    const key = `${row.document}\u0000${row.label}`;
    const seen = groups.get(key);
    if (!seen) {
      groups.set(key, { ...row, pages: [...row.pages], values: 1 });
      continue;
    }
    seen.values += 1;
    seen.count += row.count;
    for (const page of row.pages) if (!seen.pages.includes(page)) seen.pages.push(page);
    seen.pages.sort((a, b) => a - b);
  }
  const occurrences = (rows: FindingRow[]) => rows.reduce((total, row) => total + row.count, 0);
  return {
    rows: [...groups.values()].slice(0, limit),
    high: occurrences(high),
    confirmedHigh: occurrences(high.filter((row) => row.evidence === "confirmed")),
  };
}
