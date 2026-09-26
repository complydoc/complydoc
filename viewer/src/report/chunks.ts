import type { ChunkRun } from "./chunkTypes";
import type { Tone } from "./select";

/** Each flag a chunk can carry, and what sets it. In the order the report lists them. */
export const FLAGS: { key: string; meaning: string }[] = [
  { key: "tiny", meaning: "fewer tokens than the minimum" },
  { key: "oversized", meaning: "more tokens than the maximum" },
  { key: "split_sentence", meaning: "ends mid-sentence and the next chunk continues it" },
  { key: "split_table", meaning: "ends inside a table that the next chunk continues" },
  { key: "heading_at_end", meaning: "ends on a heading, separated from its section" },
  { key: "duplicate", meaning: "repeats an earlier chunk" },
  { key: "path_metadata", meaning: "metadata holds an absolute file path" },
];

export function flaggedChunks(run: ChunkRun): number {
  return run.chunks.filter((chunk) => chunk.flags.length > 0).length;
}

/** Share of questions answered by a chunk in the top `top_k`. Null without questions. */
export function retrievalHitRate(run: ChunkRun): number | null {
  if (run.retrieval.length === 0) return null;
  return run.retrieval.filter((r) => r.status === "retrieved").length / run.retrieval.length;
}

/** Mean of 1/rank over the questions retrieved in the top `top_k`, 0 for the rest. */
export function meanReciprocalRank(run: ChunkRun): number | null {
  if (run.retrieval.length === 0) return null;
  const total = run.retrieval.reduce((sum, r) => sum + (r.status === "retrieved" && r.rank ? 1 / r.rank : 0), 0);
  return total / run.retrieval.length;
}

export function factCounts(run: ChunkRun): { whole: number; split: number; missing: number } {
  const count = (status: string) => run.facts.filter((fact) => fact.status === status).length;
  return { whole: count("whole"), split: count("split"), missing: count("missing") };
}

export const FACT_TONE: Record<string, Tone> = { whole: "good", split: "warn", missing: "bad" };
export const RETRIEVAL_TONE: Record<string, Tone> = { retrieved: "good", ranked_low: "warn", split: "warn", missing: "bad" };
