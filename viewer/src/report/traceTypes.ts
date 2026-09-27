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

export interface TraceStage {
  index: number;
  kind: "load" | "transform" | "split" | "embed" | "custom";
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
  finished: boolean;
  error: string | null;
}

export interface Trace {
  name: string;
  scan: "patterns" | "full" | "off";
  seconds: number;
  overhead_seconds: number;
  stages: TraceStage[];
  connections_outside: string[];
  libraries: Record<string, string>;
  error: string | null;
}
