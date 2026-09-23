/**
 * Everything the pages derive from a report, as plain functions.
 *
 * Kept out of the components so each rule is tested once and the components
 * only lay things out.
 */
import { humanise } from "./format";
import type { Band, DocumentEntry, LoaderComparison, Report, Severity } from "./types";

/** Limitation areas about loaders and readers. They are told on the Documents page. */
const READER_AREAS = new Set(["Loaders", "Extraction"]);

export const BANDS: readonly { key: Band; label: string; tone: Tone }[] = [
  { key: "ready", label: "Ready", tone: "good" },
  { key: "workable", label: "Workable", tone: "neutral" },
  { key: "needs work", label: "Needs work", tone: "warn" },
  { key: "not ready", label: "Not ready", tone: "bad" },
];

export const SEVERITIES: readonly Severity[] = ["high", "medium", "low"];

export type Tone = "good" | "neutral" | "warn" | "bad";

export function severityTone(severity: Severity): Tone {
  return severity === "high" ? "bad" : severity === "medium" ? "warn" : "neutral";
}

/** The band a score falls in, on the same thresholds complydoc scores with. */
export function bandOf(score: number | null): Band | null {
  if (score === null) return null;
  if (score >= 75) return "ready";
  if (score >= 50) return "workable";
  if (score >= 25) return "needs work";
  return "not ready";
}

export function bandTone(band: Band | null): Tone {
  return BANDS.find((b) => b.key === band)?.tone ?? "neutral";
}

/** The bands with at least one document, best first. */
export function bandCounts(report: Report): { key: Band; label: string; tone: Tone; count: number }[] {
  return BANDS.map((band) => ({ ...band, count: report.overall.bands[band.key] ?? 0 })).filter(
    (band) => band.count > 0,
  );
}

export interface CategoryCount {
  category: string;
  /** The name complydoc gives the category, such as "IBAN". */
  label: string;
  count: number;
}

/** Identifier categories, most frequent first, named as complydoc names them. */
export function categoriesByCount(report: Report): CategoryCount[] {
  const labels = new Map(
    report.documents.flatMap((document) => document.sensitive.matches.map((m) => [m.category, m.label] as const)),
  );
  return Object.entries(report.aggregate.sensitive_by_category)
    .map(([category, count]) => ({ category, label: labels.get(category) ?? humanise(category), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface DocumentRow {
  path: string;
  format: string;
  pages: number;
  score: number | null;
  findings: number;
  highest: Severity | null;
}

function highestSeverity(document: DocumentEntry): Severity | null {
  const found = new Set(document.sensitive.matches.map((m) => m.severity));
  return SEVERITIES.find((s) => found.has(s)) ?? null;
}

/** One row per document, the least ready first, since those need attention. */
export function documentRows(report: Report): DocumentRow[] {
  return report.documents
    .map((document) => ({
      path: document.relative_path,
      format: document.format,
      pages: document.page_count,
      score: report.overall.by_document[document.path] ?? null,
      findings: document.sensitive.matches.length,
      highest: highestSeverity(document),
    }))
    .sort((a, b) => (a.score ?? -1) - (b.score ?? -1) || a.path.localeCompare(b.path));
}

/** Loader names in the order the comparison ranked them, best first. */
export function rankedLoaders(comparison: LoaderComparison) {
  const order = new Map(comparison.ranked.map((name, index) => [name, index]));
  return [...comparison.loaders].sort(
    (a, b) => (order.get(a.name) ?? Infinity) - (order.get(b.name) ?? Infinity),
  );
}

export interface OnlySome {
  kind: "Document" | "Metadata key";
  name: string;
  loaders: string[];
}

/** Documents and metadata keys that some loaders returned and others did not. */
export function returnedBySomeOnly(comparison: LoaderComparison): OnlySome[] {
  const documents = Object.entries(comparison.documents).map(([name, loaders]) => ({
    kind: "Document" as const,
    name,
    loaders,
  }));
  const keys = Object.entries(comparison.metadata_keys).map(([name, loaders]) => ({
    kind: "Metadata key" as const,
    name,
    loaders,
  }));
  return [...documents, ...keys];
}

export interface Caveat {
  area: string;
  statements: string[];
}

/** The important limitations for the summary, one entry per area, reader caveats left out. */
export function summaryCaveats(report: Report): Caveat[] {
  const byArea = new Map<string, string[]>();
  for (const limitation of report.limitations) {
    if (limitation.severity !== "important" || READER_AREAS.has(limitation.area)) continue;
    byArea.set(limitation.area, [...(byArea.get(limitation.area) ?? []), limitation.statement]);
  }
  return [...byArea].map(([area, statements]) => ({ area, statements }));
}
