/**
 * The parts of complydoc's report JSON the viewer reads.
 *
 * A subset of schemas 15 to 21, written by `complydoc audit --json` or
 * `complydoc.write_json`. Fields the viewer does not use are left out, so an
 * addition to the report never breaks it.
 */

import type { CategorySummary, ConceptFinding, ConceptSummary, IgnoreSummary, IgnoredFinding } from "./setupTypes";

import type { ChunkRun } from "./chunkTypes";
import type { LoaderComparison } from "./loaderTypes";
import type { Trace } from "./traceTypes";
import type {
  Extraction,
  PageText,
  DocumentTiming,
  DocumentVerification,
  VerificationSummary,
  PagePreview,
} from "./pageTypes";
import type { PageRoute, Cost } from "./costTypes";

export type { ChunkRun, InspectedChunk, QuestionResult } from "./chunkTypes";
export type {
  Extraction,
  ReadingCost,
  PageText,
  VerificationStatus,
  PageVerification,
  DocumentTiming,
  DocumentVerification,
  VerificationSummary,
  Box,
  PagePreview,
} from "./pageTypes";
export type { PageRoute, CostPath, Architecture, ModelCost, Cost } from "./costTypes";
export type { StageIdentifier, StagePreview, Trace, TraceStage } from "./traceTypes";

export type {
  FactCheck,
  FormatComparison,
  FormatLoaderRow,
  IdentifierDifference,
  LoaderComparison,
  LoaderRow,
} from "./loaderTypes";

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
  /** Set when the documents came from a loader rather than complydoc's own readers. */
  loader?: LoaderRun | null;
  cost: Cost | null;
  /** Schema 16: pages read again by a vision model. Null or absent without --verify. */
  verification?: VerificationSummary | null;
  /** Schema 17: each text splitter a `complydoc chunks` run inspected. Null or absent otherwise. */
  chunks?: ChunkRun[] | null;
  /** Schema 17: set for a pipeline observed with `cd.observe`. */
  trace?: Trace | null;
  /** Schema 17: the ignore file the run read, and what each entry did. Null or absent without one. */
  ignores?: IgnoreSummary | null;
  /** Schema 17: the custom concepts the run looked for. Null or absent without a concepts file. */
  concepts?: ConceptSummary | null;
  /** Schema 21: the categories the run looked for otherwise than as shipped. Null or absent without a categories file. */
  categories?: CategorySummary | null;
  /** The lines complydoc judged this report by. Filled in by `parseReport` for reports older than schema 17. */
  thresholds: Thresholds;
}

export interface Thresholds {
  /** The lowest score in each readiness band. */
  bands: Record<Band, number>;
  /** Below this, two readings of a page tell different stories. */
  similar_enough: number;
}

export interface LoaderRun {
  name: string;
  tags: string[];
  network_allowed: boolean;
  error: string | null;
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
  /** What the run measured, of `cost`, `readiness` and `sensitive`. Empty for a chunks run. */
  components_run?: string[];
  started_at: string;
  duration_seconds: number;
  offline_guard: string;
  /** Schema 16: the vision reading pages were checked against, e.g. "vision:claude-opus-5". */
  verify_model?: string | null;
  verify_scope?: "flagged" | "all" | null;
  content_sent_to?: string[];
  /** True when the run kept identifier values unmasked (`--reveal`). */
  reveal_used?: boolean;
  /** Schema 23: where the run came from, as CI or git told it. */
  context?: RunContext | null;
}

export interface RunContext {
  /** `host/owner/name`, never with credentials. */
  repository?: string | null;
  branch?: string | null;
  commit?: string | null;
  /** Whether the working tree had uncommitted changes; null when not known, as in CI. */
  dirty?: boolean | null;
  workflow?: string | null;
  /** The page of the CI run. */
  url?: string | null;
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
  /** Schema 17: findings an ignore file set aside, left out of the counts above. */
  ignored_total?: number;
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

export interface UnscannedCategory {
  category: string;
  label: string;
  reason: string;
}

export interface SensitiveMatch {
  category: string;
  label: string;
  severity: Severity;
  masked: string;
  /** The value itself, on a run with --reveal; null otherwise, and for a category never revealed. */
  revealed?: string | null;
  page: number | null;
  evidence: Evidence;
  /** Checks the value passed, such as "luhn" or "iban_mod97". */
  validators_passed?: string[];
  /** A label found beside the value, such as "IBAN". */
  context_term?: string | null;
  /** The name model's score, where a model found it, 0 to 1. */
  confidence?: number | null;
  /** Schema 17: the same for this value in every document and run; what an ignore names. */
  fingerprint?: string;
  /** Where on the page's text it sits: 1-based line, 0-based column, and its length. */
  line?: number;
  column?: number;
  length?: number;
}

/** A passage that reads as an instruction to a model and is hidden from a person. */
export interface ContentFinding {
  excerpt: string;
  page: number | null;
  severity: Severity;
  /** How the passage was judged to address a model: `none` where it does not read as an instruction. */
  instruction?: "none" | "pattern" | "model" | "confirmed";
  /** `visible`, or hidden: `suspected` or `confirmed`. */
  visibility?: "visible" | "suspected" | "confirmed";
  hidden_reasons: string[];
  instruction_reasons: string[];
  /** Schema 17: the same for this passage in every run; what an ignore names. */
  fingerprint?: string;
}

export interface DocumentEntry {
  /** Schema 20, for a large report only: the file beside it holding this document's page text
   * and layout, fetched when the document is opened. Until then each reading is "…" or empty. */
  parts?: string;
  path: string;
  relative_path: string;
  format: string;
  page_count: number;
  sensitive: {
    matches: SensitiveMatch[];
    /** Categories nothing was looked for in this document, and why: a missing model, say. */
    unscanned_categories?: UnscannedCategory[];
  };
  content_findings: ContentFinding[];
  /** Schema 17: findings an ignore file set aside. Not in `sensitive.matches` or `content_findings`. */
  ignored?: IgnoredFinding[];
  /** Schema 17, with --judge-concepts only: pages a judgement model said hold one of your concepts. */
  concept_findings?: ConceptFinding[];
  extractions: Extraction[];
  extracted_text: PageText[];
  /** Wall clock spent on the document. */
  timing?: DocumentTiming | null;
  /** Left out of a summary report. */
  previews?: PagePreview[];
  /** Schema 16: pages read again by a vision model. */
  verification?: DocumentVerification | null;
  /** The route each page needs: its text layer, OCR, or a vision model. */
  routing?: { pages: PageRoute[] } | null;
}

export type {
  IgnoreRule,
  IgnoreSummary,
  IgnoredFinding,
  Concept,
  ConceptRule,
  ConceptSummary,
  ConceptFinding,
  CategoryChangeRecord,
  CategorySummary,
  CategoryRow,
} from "./setupTypes";
