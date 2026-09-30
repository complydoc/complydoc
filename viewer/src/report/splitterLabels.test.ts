import { describe, expect, it } from "vitest";
import { splitterLabels } from "./chunkView";

describe("splitterLabels", () => {
  it("names a splitter by its settings, and by its class where two share them", () => {
    const labels = splitterLabels([
      "RecursiveCharacterTextSplitter chunk_size=500 chunk_overlap=50",
      "RecursiveCharacterTextSplitter chunk_size=1000 chunk_overlap=100",
      "TokenTextSplitter chunk_size=1000 chunk_overlap=100",
    ]);
    expect([...labels.values()]).toEqual([
      "chunk_size 500 · chunk_overlap 50",
      "RecursiveCharacterTextSplitter · chunk_size 1000 · chunk_overlap 100",
      "TokenTextSplitter · chunk_size 1000 · chunk_overlap 100",
    ]);
  });
});
