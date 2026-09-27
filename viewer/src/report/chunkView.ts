/** A chunks run as the Chunks page shows it: each splitter's figures, and where it cut badly. */
import type { ChunkRun } from "./chunkTypes";

/** Each flag in a few words, worded to follow a count of chunks. */
const FLAG_WORDS: Record<string, string> = {
  split_sentence: "cut mid-sentence",
  split_table: "cut mid-table",
  heading_at_end: "end on a heading",
  tiny: "tiny",
  oversized: "oversized",
  duplicate: "repeat another",
  path_metadata: "carry a file path",
};

/** A splitter's name as the run gave it, `Class key=value …`, as its class and its settings. */
export function splitterName(chunker: string): { kind: string; settings: string[] } {
  const [kind = chunker, ...rest] = chunker.split(/\s+/);
  const settings = rest.filter((part) => part.includes("="));
  return settings.length > 0
    ? { kind, settings: settings.map((s) => s.replace("=", " ")) }
    : { kind: chunker, settings: [] };
}

/** The flags a splitter set, most chunks first, each counted and in words; none left out but zeros. */
export function flagSummary(run: ChunkRun): { key: string; count: number; words: string }[] {
  return Object.entries(run.flag_counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, words: FLAG_WORDS[key] ?? key.replaceAll("_", " ") }));
}

/** Chunk sizes in tokens, counted into `bins` equal ranges from the smallest to the largest. */
export function sizeHistogram(run: ChunkRun, bins = 18): number[] {
  const counts = new Array<number>(bins).fill(0);
  const { tokens_min: low, tokens_max: high } = run.stats;
  const width = Math.max(1, (high - low) / bins);
  for (const chunk of run.chunks) {
    const bin = Math.min(bins - 1, Math.floor((chunk.tokens - low) / width));
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  return counts;
}

export interface DocumentCuts {
  document: string;
  chunks: number;
  flagged: number;
}

/** Each document's chunks, and how many of them are flagged, the most flagged first. */
export function cutsByDocument(run: ChunkRun): DocumentCuts[] {
  const byDocument = new Map<string, DocumentCuts>();
  for (const chunk of run.chunks) {
    if (!chunk.document) continue;
    const entry = byDocument.get(chunk.document) ?? { document: chunk.document, chunks: 0, flagged: 0 };
    entry.chunks += 1;
    if (chunk.flags.length > 0) entry.flagged += 1;
    byDocument.set(chunk.document, entry);
  }
  return [...byDocument.values()].sort((a, b) => b.flagged - a.flagged || b.chunks - a.chunks);
}
