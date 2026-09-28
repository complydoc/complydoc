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
  /** A pipeline's steps: load, transform, split, embed, custom. An audit's: a document, and
   * inside it read, ocr, analyse, scan and verify. */
  kind:
    | "load"
    | "transform"
    | "split"
    | "embed"
    | "custom"
    | "document"
    | "read"
    | "ocr"
    | "analyse"
    | "scan"
    | "verify";
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
