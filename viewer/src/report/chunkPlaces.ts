import type { Loaded } from "./collections";
import type { DocumentEntry } from "./types";

/** A chunk where it sits on a page, in characters of the page's text. */
export interface PageChunk {
  index: number;
  start: number;
  end: number;
  tokens: number;
  flags: string[];
}

/** One splitter's chunks of one document, by page. */
export interface ChunkLayer {
  splitter: string;
  /** When the chunks run started, to say which run the chunks are from. */
  run: string;
  pages: Map<number, PageChunk[]>;
}

/** Whether a chunk's source names this document: its path from the folder, or a path ending in it. */
export function sameDocument(source: string | null, path: string): boolean {
  if (!source) return false;
  const normal = source.replaceAll("\\", "/");
  return normal === path || normal.endsWith(`/${path}`);
}

/**
 * The chunks the folder's newest chunks run made of `document`, one layer per splitter.
 *
 * A chunk is drawn on a page only where the page's text is the one it was placed in:
 * the same length as the text the splitter was given. A page read by another reader
 * would put every chunk in the wrong place, so it gets none.
 */
export function chunkLayers(runs: Loaded[], document: DocumentEntry): ChunkLayer[] {
  const source = runs.find((run) => (run.report.chunks?.length ?? 0) > 0);
  if (!source) return [];
  const lengths = new Map(document.extracted_text.map((page) => [page.number, page.characters]));
  const layers: ChunkLayer[] = [];
  for (const splitter of source.report.chunks ?? []) {
    const pages = new Map<number, PageChunk[]>();
    for (const chunk of splitter.chunks) {
      const { start, end, page } = chunk;
      if (start === null || start === undefined || end === null || end === undefined || page === null) continue;
      if (!sameDocument(chunk.document, document.relative_path)) continue;
      if (chunk.page_characters !== lengths.get(page)) continue;
      const placed = pages.get(page) ?? [];
      placed.push({ index: chunk.index, start, end, tokens: chunk.tokens, flags: chunk.flags });
      pages.set(page, placed);
    }
    if (pages.size > 0) layers.push({ splitter: splitter.chunker, run: source.report.run.started_at, pages });
  }
  return layers;
}
