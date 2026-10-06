/** Pages as the report keeps them: what each reader took off them, how a vision model checked them, and their picture. */
export interface Extraction {
  extractor: string;
  characters: number;
  /** How long the reader took over the whole document. */
  seconds?: number;
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
  /** Schema 16: how long each reader took on this page, where it was timed. */
  seconds?: Record<string, number>;
  /** Schema 16: text tokens in each reading, by reader, then by `ModelCost.tokenizer`. */
  tokens?: Record<string, Record<string, number>>;
  /** Schema 16: image tokens for the page, by `ModelCost.vision_formula`. */
  image_tokens?: Record<string, number>;
  /** Schema 17, with --reveal only: `text` with every identifier covered; `text` then holds the values. */
  masked_text?: string | null;
  masked_ocr_text?: string | null;
  masked_readings?: Record<string, string> | null;
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
  /** How long the model took to answer for this page. */
  seconds?: number | null;
}

export interface DocumentTiming {
  read_seconds: number;
  analyse_seconds: number;
  scan_seconds: number;
  total_seconds: number;
  seconds_per_page: number | null;
  /** Schema 17: when reading began, in seconds since the epoch. */
  started_at?: number | null;
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
  /** Schema 20: where the report keeps the picture, beside it: `<report>.parts/pages/…`. */
  image?: string | null;
  /** Schema 22: identifiers on the page that could not be covered, for which its picture was left out. */
  image_withheld?: number;
  unreadable: boolean;
}
