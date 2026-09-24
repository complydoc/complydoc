/**
 * The parts of complydoc's report JSON the viewer reads.
 *
 * A subset of schemas 15 and 16, written by `complydoc audit --json` or
 * `complydoc.write_json`. Fields the viewer does not use are left out, so an
 * addition to the report never breaks it.
 */

export type Band = "ready" | "workable" | "needs work" | "not ready";
export type Severity = "high" | "medium" | "low";
export type LimitationSeverity = "info" | "important";
export type FactMatch = "exact" | "close" | null;
/** How strongly a finding is backed, strongest first. */
export type Evidence = "confirmed" | "corroborated" | "pattern" | "model";

export interface Report {
  run: RunMetadata;
  overall: Overall;
  aggregate: Aggregate;
  quick_wins: QuickWin[];
  limitations: Limitation[];
  documents: DocumentEntry[];
  loader_comparison: LoaderComparison | null;
  cost: Cost | null;
  /** Schema 16: pages read again by a vision model. Null or absent without --verify. */
  verification?: VerificationSummary | null;
}

export interface RunMetadata {
  schema_version: number;
  /** The library that read the text layer, or the first loader compared. */
  extractor: string;
  ocr_compare_used: boolean;
  page_images_used: boolean;
  tool_version: string;
  report_detail: "summary" | "full";
  target: string;
  started_at: string;
  duration_seconds: number;
  offline_guard: string;
  /** Schema 16: the vision reading pages were checked against, e.g. "vision:claude-opus-5". */
  verify_model?: string | null;
  verify_scope?: "flagged" | "all" | null;
  content_sent_to?: string[];
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
  evidence: Evidence;
}

/** A passage that reads as an instruction to a model and is hidden from a person. */
export interface ContentFinding {
  excerpt: string;
  page: number | null;
  severity: Severity;
  hidden_reasons: string[];
  instruction_reasons: string[];
}

export interface Extraction {
  extractor: string;
  characters: number;
  similarity: number;
  reordered: boolean;
}

/**
 * What one reading of one page cost. `local` is a reader that ran on the
 * auditing machine, and has no bill; `actual` came from the provider's own
 * token counts; `estimated` from the page's size and a price table.
 */
export interface ReadingCost {
  usd: number | null;
  basis: "local" | "actual" | "estimated" | "unpriced";
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

/** The text read off one page: the kept reading, the others, and OCR's. */
export interface PageText {
  number: number;
  /** Where the kept text came from: the text layer, OCR, a loader, or a vision model. */
  source: "native" | "ocr" | "loader" | "vision" | "none";
  characters: number;
  text: string;
  ocr_text: string;
  truncated: boolean;
  /** What each other reader made of the page, by name. */
  readings: Record<string, string>;
  /** Schema 16: the reader whose text `text` is. */
  kept?: string;
  /** Schema 16: what each reading cost, keyed like `readings`, with the kept one and "ocr". */
  costs?: Record<string, ReadingCost>;
  /** Schema 16: what the cheapest priced vision model would cost for this page. */
  vision_estimate?: ReadingCost | null;
}

export type VerificationStatus = "agrees" | "disagrees" | "filled" | "failed" | "not_rendered";

/** One page read again by a vision model. */
export interface PageVerification {
  number: number;
  status: VerificationStatus;
  why: string;
  similarity: number | null;
  /** Share of the vision reading's words the kept reading holds, 0 to 1. */
  coverage: number | null;
  /** What the vision reading has that the kept one lacks, masked. */
  missing: string;
  cost: ReadingCost | null;
  error: string | null;
}

export interface DocumentVerification {
  model: string;
  scope: "flagged" | "all";
  pages_total: number;
  pages: PageVerification[];
  unreadable_pages: number[];
  sent_to: string[];
}

export interface VerificationSummary {
  model: string;
  scope: "flagged" | "all";
  min_coverage: number;
  documents: number;
  pages_total: number;
  pages_checked: number;
  pages_agree: number;
  pages_disagree: number;
  pages_filled: number;
  pages_failed: number;
  pages_unreadable: number;
  usd: number | null;
  usd_basis: "actual" | "estimated" | "mixed" | "unpriced";
  headline: string;
}

/** A rectangle on the page, as fractions of its width and height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string | null;
  title: string | null;
  value: string | null;
}

/** A page's geometry, and its picture when the run was asked for one. Full reports only. */
export interface PagePreview {
  number: number;
  width_pt: number;
  height_pt: number;
  text_blocks: Box[];
  image_blocks: Box[];
  sensitive: Box[];
  image_data_uri: string | null;
  unreadable: boolean;
}

export interface DocumentEntry {
  path: string;
  relative_path: string;
  format: string;
  page_count: number;
  sensitive: { matches: SensitiveMatch[] };
  content_findings: ContentFinding[];
  extractions: Extraction[];
  extracted_text: PageText[];
  /** Left out of a summary report. */
  previews?: PagePreview[];
  /** Schema 16: pages read again by a vision model. */
  verification?: DocumentVerification | null;
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

export type CostPath = "text_layer" | "text_ocr" | "vision";

/** What sending the folder to a model costs one way. Null where the path serves no document. */
export interface Architecture {
  key: CostPath;
  label: string;
  per_1000_usd: number | null;
  folder_usd: number | null;
  documents_served: number;
  documents_total: number;
}

export interface ModelCost {
  model_id: string;
  display_name: string;
  provider: string;
  /** "verified" by hand, or imported from a third-party table. */
  price_source: string;
  architectures: Architecture[];
}

export interface Cost {
  currency: string;
  models: ModelCost[];
}
