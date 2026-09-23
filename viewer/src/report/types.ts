/**
 * The parts of complydoc's report JSON the viewer reads.
 *
 * A subset of schema 15, written by `complydoc audit --json` or
 * `complydoc.write_json`. Fields the viewer does not use are left out, so an
 * addition to the report never breaks it.
 */

export type Band = "ready" | "workable" | "needs work" | "not ready";
export type Severity = "high" | "medium" | "low";
export type LimitationSeverity = "info" | "important";
export type FactMatch = "exact" | "close" | null;

export interface Report {
  run: RunMetadata;
  overall: Overall;
  aggregate: Aggregate;
  quick_wins: QuickWin[];
  limitations: Limitation[];
  documents: DocumentEntry[];
  loader_comparison: LoaderComparison | null;
}

export interface RunMetadata {
  schema_version: number;
  tool_version: string;
  report_detail: "summary" | "full";
  target: string;
  started_at: string;
  duration_seconds: number;
  offline_guard: string;
}

export interface Factor {
  key: string;
  name: string;
  score: number | null;
  weight: number;
  why: string;
}

export interface Overall {
  score: number | null;
  label: Band | null;
  bands: Partial<Record<Band, number>>;
  factors: Factor[];
  scored_documents: number;
  total_documents: number;
  by_document: Record<string, number>;
}

export interface Aggregate {
  documents_audited: number;
  pages_total: number;
  sensitive_total: number;
  sensitive_by_severity: Partial<Record<Severity, number>>;
  sensitive_by_category: Record<string, number>;
  documents_with_sensitive_data: number;
  content_findings_total: number;
  seconds_per_document: number;
}

export interface QuickWin {
  id: string;
  actor: string;
  title: string;
  detail: string;
  documents: string[];
}

export interface Limitation {
  area: string;
  statement: string;
  severity: LimitationSeverity;
  affected: string[];
}

export interface SensitiveMatch {
  category: string;
  label: string;
  severity: Severity;
  masked: string;
  page: number | null;
  evidence: string;
}

export interface Extraction {
  extractor: string;
  characters: number;
  similarity: number;
  reordered: boolean;
}

export interface DocumentEntry {
  path: string;
  relative_path: string;
  format: string;
  page_count: number;
  sensitive: { matches: SensitiveMatch[] };
  extractions: Extraction[];
}

export interface LoaderRow {
  name: string;
  documents: number;
  pages: number;
  characters: number;
  seconds: number;
  readiness_score: number | null;
  facts_found: number;
  identifiers_in_text: number;
  error: string | null;
}

export interface FactCheck {
  fact: string;
  found: Record<string, FactMatch>;
  scores: Record<string, number>;
  nearest: Record<string, string | null>;
  documents: Record<string, string | null>;
}

export interface IdentifierDifference {
  category: string;
  value: string;
  location: "text" | "metadata";
  found_by: string[];
  missed_by: string[];
}

export interface LoaderComparison {
  baseline: string;
  loaders: LoaderRow[];
  recommended: string | null;
  verdict: string;
  ranked: string[];
  facts: FactCheck[];
  identifier_differences: IdentifierDifference[];
  documents: Record<string, string[]>;
  metadata_keys: Record<string, string[]>;
}
