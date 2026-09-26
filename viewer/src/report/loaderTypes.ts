/** The report's `loader_comparison`: several loaders on the same documents. */

import type { FactMatch } from "./types";

export interface LoaderRow {
  name: string;
  documents: number;
  pages: number;
  characters: number;
  /** How long the loader took over every file, or null for documents passed in already loaded. */
  seconds: number | null;
  readiness_score: number | null;
  facts_found: number;
  identifiers_in_text: number;
  error: string | null;
  /** Schema 17: files not given to the loader, being of a type it is not meant for. */
  skipped?: string[];
  /** Schema 17: the extensions it is meant for, or null when it was given every file. */
  formats?: string[] | null;
}

/** Schema 17: one loader on the documents of one file type. */
export interface FormatLoaderRow {
  name: string;
  documents: number;
  pages: number;
  characters: number;
  seconds: number | null;
  /** Mean similarity to each document's baseline, 0 to 1. Null when it returned none. */
  similarity: number | null;
  failures: Record<string, string>;
  facts_found: number | null;
  error: string | null;
}

/** Schema 17: the comparison repeated for one file type. */
export interface FormatComparison {
  format: string;
  label: string;
  documents: number;
  /** The loaders given these files, in the order the comparison named them. */
  loaders: FormatLoaderRow[];
  /** Loaders not meant for this type. */
  skipped_by: string[];
  facts: number;
  recommended: string | null;
  verdict: string;
  ranked: string[];
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
  /** Schema 17: the comparison for each file type in the run. */
  formats?: FormatComparison[];
  /** Schema 17: documents measured against a loader other than the first, and that loader. */
  baselines?: Record<string, string>;
}
