/** Schema 17: the report's `chunks`, one entry per text splitter `complydoc chunks` ran. */

export interface InspectedChunk {
  index: number;
  document: string | null;
  page: number | null;
  characters: number;
  tokens: number;
  /** Each as `label: masked value`. */
  identifiers: string[];
  /** Hidden or instruction-like passages of medium severity or above. */
  hidden: number;
  flags: string[];
  metadata_keys: string[];
  /** The start of the chunk, identifiers masked. */
  preview: string;
  /** Schema 17: where the chunk sits in its page's text; null where it could not be placed. */
  start?: number | null;
  end?: number | null;
  /** How long the page's text was, to tell whether a page text on hand is the same one. */
  page_characters?: number | null;
}

export interface ChunkStats {
  count: number;
  tokens_total: number;
  tokens_min: number;
  tokens_median: number;
  tokens_p95: number;
  tokens_max: number;
}

export interface FactLocation {
  fact: string;
  status: "whole" | "split" | "missing";
  chunks: number[];
}

export interface QuestionResult {
  question: string;
  fact: string;
  status: "retrieved" | "ranked_low" | "split" | "missing";
  rank: number | null;
  answer_chunks: number[];
  top_chunks: number[];
}

export interface ChunkRun {
  chunker: string;
  chunks: InspectedChunk[];
  stats: ChunkStats;
  token_encoding: string;
  token_fidelity: string;
  flag_counts: Record<string, number>;
  /** What sets each flag, as complydoc words it. Absent from the first chunks reports. */
  flag_meanings?: Record<string, string>;
  repeated_identifiers: Record<string, number>;
  facts: FactLocation[];
  retrieval: QuestionResult[];
  top_k: number;
}
