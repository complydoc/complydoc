/** A chunks run as the Chunks page shows it: each splitter's figures, and where it cut badly. */
import { factCounts, flaggedChunks, retrievalHitRate } from "./chunks";
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

/** Why each flag matters, for a reader who has not chunked text before. */
export const FLAG_HELP: Record<string, string> = {
  split_sentence: "The chunk stops halfway through a sentence, so neither half says the whole thing.",
  split_table: "A table is cut in two, so rows end up apart from their header.",
  heading_at_end: "The chunk ends on a heading whose text is in the next chunk.",
  tiny: "So small it carries little meaning on its own.",
  oversized: "Larger than the limit asked for, so it may not fit the model or the index.",
  duplicate: "The same text as another chunk, stored and searched twice.",
  path_metadata: "Its metadata holds a file path, which can name a person or a client.",
};

/** What "identifiers in several chunks" means, said once where it is shown. */
export const SPREAD_HELP =
  "Identifiers that end up in more than one chunk. Each copy is a place to mask or delete, and overlap makes more of them.";

/**
 * The splitter that cut this folder least badly: the most facts kept whole and questions
 * answered, where the run had them, then the smallest share of chunks cut badly, then the
 * fewest identifiers spread over several chunks. Null with fewer than two to choose from.
 */
export function leastBad(runs: ChunkRun[]): ChunkRun | null {
  if (runs.length < 2) return null;
  const score = (run: ChunkRun) => [
    -(run.facts.length ? factCounts(run).whole / run.facts.length : 0),
    -(retrievalHitRate(run) ?? 0),
    run.stats.count ? flaggedChunks(run) / run.stats.count : 1,
    Object.keys(run.repeated_identifiers).length,
  ];
  return [...runs].sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  })[0] ?? null;
}

/** A splitter's name as the run gave it, `Class key=value …`, as its class and its settings. */
export function splitterName(chunker: string): { kind: string; settings: string[] } {
  const [kind = chunker, ...rest] = chunker.split(/\s+/);
  const settings = rest.filter((part) => part.includes("="));
  return settings.length > 0
    ? { kind, settings: settings.map((s) => s.replace("=", " ")) }
    : { kind: chunker, settings: [] };
}

/** A splitter's settings as a short name, or its whole name where it gave none. */
export const splitterShortName = (run: ChunkRun) => splitterName(run.chunker).settings.join(" · ") || run.chunker;

/**
 * A short name for each splitter of a run, by its `chunker`: its settings, with its class
 * before them where another splitter has the same settings, and in full where even that
 * does not tell two apart.
 */
export function splitterLabels(chunkers: string[]): Map<string, string> {
  const short = (chunker: string) => splitterName(chunker).settings.join(" · ") || chunker;
  const count = (names: string[], name: string) => names.filter((n) => n === name).length;
  const shorts = chunkers.map(short);
  const withKind = chunkers.map((chunker, i) => {
    const name = shorts[i] ?? chunker;
    return count(shorts, name) > 1 ? `${splitterName(chunker).kind} · ${name}` : name;
  });
  return new Map(
    chunkers.map((chunker, i) => {
      const name = withKind[i] ?? chunker;
      return [chunker, count(withKind, name) > 1 ? chunker : name];
    }),
  );
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
