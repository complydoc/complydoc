/**
 * Everything the pages derive from a report, as plain functions.
 *
 * Kept out of the components so each rule is tested once and the components
 * only lay things out.
 */
import { humanise } from "./format";
import type {
  Band,
  DocumentEntry,
  Evidence,
  LoaderComparison,
  PageVerification,
  Report,
  Severity,
  VerificationStatus,
} from "./types";

/** Limitation areas about loaders and readers. They are told on the Documents page. */
const READER_AREAS = new Set(["Loaders", "Extraction"]);

export const BANDS: readonly { key: Band; id: string; label: string; tone: Tone }[] = [
  { key: "ready", id: "ready", label: "Ready", tone: "good" },
  { key: "workable", id: "workable", label: "Workable", tone: "neutral" },
  { key: "needs work", id: "needsWork", label: "Needs work", tone: "warn" },
  { key: "not ready", id: "notReady", label: "Not ready", tone: "bad" },
];

export const SEVERITIES: readonly Severity[] = ["high", "medium", "low"];

/** How strongly a finding is backed, strongest first as complydoc orders it, in words a reader knows. */
export const EVIDENCE: readonly { key: Evidence; label: string }[] = [
  { key: "confirmed", label: "checksum passed" },
  { key: "corroborated", label: "label nearby" },
  { key: "pattern", label: "shape only" },
  { key: "model", label: "name model" },
];

export function evidenceLabel(evidence: Evidence): string {
  return EVIDENCE.find((e) => e.key === evidence)?.label ?? evidence;
}

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
export function bandCounts(report: Report): { key: Band; id: string; label: string; tone: Tone; count: number }[] {
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
  /** Position in the report's document list, which is how a document is opened. */
  index: number;
  path: string;
  format: string;
  pages: number;
  score: number | null;
  findings: number;
  highest: Severity | null;
  /** The least any other reader agreed with the kept one, 0 to 1; null when no other read it. */
  agreement: number | null;
  reordered: boolean;
  /** How a vision model's second read of the document went; null when none was made. */
  vision: DocumentVision | null;
}

export interface DocumentVision {
  checked: number;
  disagree: number;
  /** Pages it read that nothing else could, or could not read, or could not be sent. */
  unsettled: number;
  usd: number | null;
}

/** A document's vision check in totals, or null when the run made none. */
export function documentVision(document: DocumentEntry): DocumentVision | null {
  const verification = document.verification;
  if (!verification) return null;
  const sent = verification.pages.filter((p) => p.status !== "not_rendered");
  const priced = verification.pages.map((p) => p.cost?.usd).filter((usd): usd is number => typeof usd === "number");
  return {
    checked: sent.length,
    disagree: verification.pages.filter((p) => p.status === "disagrees").length,
    unsettled: verification.pages.filter((p) => p.status !== "agrees" && p.status !== "disagrees").length,
    usd: priced.length > 0 ? priced.reduce((sum, usd) => sum + usd, 0) : null,
  };
}

export function visionTone(vision: DocumentVision): Tone {
  if (vision.disagree > 0) return "bad";
  if (vision.unsettled > 0) return "warn";
  return "good";
}

export const VERIFICATION_STATUS: Record<VerificationStatus, { label: string; tone: Tone }> = {
  agrees: { label: "agrees", tone: "good" },
  disagrees: { label: "disagrees", tone: "bad" },
  filled: { label: "only vision read it", tone: "warn" },
  failed: { label: "call failed", tone: "warn" },
  not_rendered: { label: "not drawn", tone: "neutral" },
};

export interface VerifiedPage extends PageVerification {
  /** Position of the document in the report, to open the page. */
  index: number;
  path: string;
}

/** Every page a vision read did not simply agree with, document by document, in page order. */
export function unsettledPages(report: Report): VerifiedPage[] {
  return report.documents.flatMap((document, index) =>
    (document.verification?.pages ?? [])
      .filter((page) => page.status !== "agrees")
      .map((page) => ({ ...page, index, path: document.relative_path })),
  );
}

function highestSeverity(document: DocumentEntry): Severity | null {
  const found = new Set(document.sensitive.matches.map((m) => m.severity));
  return SEVERITIES.find((s) => found.has(s)) ?? null;
}

/** A document's readiness score. The report keys scores by the path relative to the folder. */
export function documentScore(report: Report, document: DocumentEntry): number | null {
  return report.overall.by_document[document.relative_path] ?? null;
}

/** Below this, two readings of a page tell different stories; complydoc uses the same line. */
const SIMILAR_ENOUGH = 0.95;

/** Whether a reader moved the words around in a way worth saying: only where the readings differ. */
export function worthCallingReordered(reading: { similarity: number; reordered: boolean }): boolean {
  return reading.reordered && reading.similarity < SIMILAR_ENOUGH;
}

function agreement(document: DocumentEntry): { agreement: number | null; reordered: boolean } {
  const others = document.extractions.slice(1);
  if (others.length === 0) return { agreement: null, reordered: false };
  return {
    agreement: Math.min(...others.map((reading) => reading.similarity)),
    reordered: others.some(worthCallingReordered),
  };
}

/** How worrying a level of agreement between two readers is. */
export function agreementTone(similarity: number): Tone {
  if (similarity >= SIMILAR_ENOUGH) return "good";
  return similarity >= 0.75 ? "warn" : "bad";
}

/** One row per document, the least ready first, since those need attention. */
export function documentRows(report: Report): DocumentRow[] {
  return report.documents
    .map((document, index) => ({
      index,
      path: document.relative_path,
      format: document.format,
      pages: document.page_count,
      score: documentScore(report, document),
      findings: document.sensitive.matches.length,
      highest: highestSeverity(document),
      ...agreement(document),
      vision: documentVision(document),
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
