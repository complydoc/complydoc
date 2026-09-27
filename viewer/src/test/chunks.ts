import type { Loaded } from "@/report/collections";
import type { ChunkRun, InspectedChunk } from "@/report/chunkTypes";
import type { DocumentEntry, Report } from "@/report/types";

/** A chunk of `document`'s page placed at [start, end) in a page text `characters` long. */
export function placedChunk(
  document: DocumentEntry,
  page: number,
  start: number,
  end: number,
  characters: number,
  flags: string[] = [],
): InspectedChunk {
  return {
    index: start,
    document: document.relative_path,
    page,
    characters: end - start,
    tokens: 10,
    identifiers: [],
    hidden: 0,
    flags,
    metadata_keys: [],
    preview: "",
    start,
    end,
    page_characters: characters,
  };
}

/** A chunks run of the same folder as `audit`, one splitter's chunks. */
export function chunksRun(audit: Report, chunks: InspectedChunk[], chunker = "recursive 400"): Loaded {
  const run = { chunker, chunks } as unknown as ChunkRun;
  return {
    id: "chunks",
    name: "chunks.json",
    report: { ...audit, documents: [], chunks: [run], run: { ...audit.run, components_run: [] } },
  };
}
