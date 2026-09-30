/** Schema 17: the report's `trace`, an ingestion pipeline observed with `cd.observe`. */

export interface StageIdentifier {
  fingerprint: string;
  label: string;
  masked: string;
  severity: "high" | "medium" | "low";
  occurrences: number;
  /** `model` where only the name model found it, which a stage scanned by patterns could not. */
  evidence?: string;
}

/** One item a stage passed on, or for an embedding stage sent, masked. */
export interface StagePreview {
  source: string | null;
  page: number | null;
  characters: number;
  tokens: number | null;
  text: string;
  metadata: Record<string, string>;
}

export interface TraceStage {
  index: number;
  /** A pipeline's steps: load, transform, split, embed, store, custom. An audit's: a document, and
   * inside it read, ocr, analyse, scan and verify. A folder is the viewer's, holding an
   * audit's documents as they sit on disk; a run is the viewer's too, the root a pipeline's steps
   * hang from. */
  kind:
    | "load"
    | "transform"
    | "split"
    | "embed"
    | "store"
    | "custom"
    | "document"
    | "read"
    | "ocr"
    | "analyse"
    | "scan"
    | "verify"
    | "folder"
    | "run";
  component: string;
  module: string;
  method: string;
  seconds: number;
  tags: string[];
  parameters: Record<string, unknown>;
  documents_in: number | null;
  documents_out: number | null;
  characters_in: number | null;
  characters_out: number | null;
  sources: string[];
  /** `full`, with the name model; `patterns`; or `off`. */
  scanned: "full" | "patterns" | "off";
  identifiers: StageIdentifier[];
  hidden: number | null;
  metadata_keys: string[];
  metadata_keys_added: string[];
  path_keys: string[];
  connections: string[];
  hosts: string[];
  vectors: number | null;
  dimensions: number | null;
  /** For a split stage, its place in the report's `chunks`. */
  chunks: number | null;
  /** The stage this one ran inside: a directory loader's loader for one file, say. */
  parent?: number | null;
  /** Seconds from the start of the block to when the stage was called. */
  started?: number;
  tokens_in?: number | null;
  tokens_out?: number | null;
  /** What it cost, where it sent text to a priced model. */
  usd?: number | null;
  usd_basis?: "estimated" | "unpriced" | "local" | null;
  previews?: StagePreview[];
  finished: boolean;
  error: string | null;
  /** Schema 18: where the error was raised, paths shortened and identifiers masked. */
  traceback?: string | null;
  /** Schema 18: what the stage handled of each document. */
  documents?: StageDocument[];
  /** Schema 18: what was wrong with what it passed on, though nothing raised. */
  warnings?: StageWarning[];
}

/** What a stage passed on, or for an embedding or store stage was given, of one document. */
export interface StageDocument {
  source: string;
  /** Pages, documents, chunks or texts, as the stage handled them. */
  items: number;
  characters: number;
  /** Items with no text. */
  empty: number;
  /** Fingerprints of the identifiers in them. */
  identifiers: string[];
}

export interface StageWarning {
  /** empty_document, empty_pages, garbled, tiny_chunks, oversized_chunks, duplicate_chunks,
   * empty_texts or over_token_limit. */
  code: string;
  message: string;
  /** The documents it concerns. */
  sources: string[];
}

export interface Trace {
  name: string;
  /** `pipeline`, observed with `cd.observe`, or `audit`, complydoc's own run of a folder. */
  kind?: "pipeline" | "audit";
  scan: "patterns" | "full" | "off";
  seconds: number;
  overhead_seconds: number;
  stages: TraceStage[];
  connections_outside: string[];
  libraries: Record<string, string>;
  error: string | null;
}
