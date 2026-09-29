import { chunksRun, placedChunk } from "@/test/chunks";
import { required, sampleAudit } from "@/test/sample";
import { chunkLayers } from "./chunkPlaces";

const audit = sampleAudit();
const document = required(audit.documents[0]);
const page = required(document.extracted_text[0]);
const at = (start: number, end: number, characters = page.characters, flags: string[] = []) =>
  placedChunk(document, page.number, start, end, characters, flags);

describe("chunkLayers", () => {
  it("places a splitter's chunks on the pages whose text they were cut from", () => {
    const [layer] = chunkLayers(
      [chunksRun(audit, [at(0, 40), at(40, 90, page.characters, ["split_sentence"])])],
      document,
    );
    expect(layer?.splitter).toBe("recursive 400");
    expect(layer?.pages.get(page.number)?.map((c) => [c.start, c.end, c.flags])).toEqual([
      [0, 40, []],
      [40, 90, ["split_sentence"]],
    ]);
  });

  it("draws none on a page read another way, where every place would be wrong", () => {
    expect(chunkLayers([chunksRun(audit, [at(0, 40, page.characters + 7)])], document)).toEqual([]);
  });

  it("places them on a page that differs only by the line break one reader ends it with", () => {
    // pypdf ends a page with "\n"; PyPDFLoader strips it. The chunk's end is kept on the page.
    const [layer] = chunkLayers([chunksRun(audit, [at(0, page.characters + 1, page.characters + 1)])], document);
    expect(layer?.pages.get(page.number)?.map((c) => [c.start, c.end])).toEqual([[0, page.characters]]);
    expect(chunkLayers([chunksRun(audit, [at(0, 40, page.characters - 1)])], document)).toEqual([]);
  });

  it("has nothing to draw where the folder has no chunks run", () => {
    expect(chunkLayers([], document)).toEqual([]);
  });
});
