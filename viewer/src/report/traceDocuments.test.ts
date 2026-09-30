import { describe, expect, it } from "vitest";
import { sampleTrace, stage } from "@/test/trace";
import { journeys } from "./traceDocuments";

const doc = (source: string, identifiers: string[], items = 1) => ({
  source,
  items,
  characters: 100,
  empty: 0,
  identifiers,
});

const trace = {
  ...sampleTrace(),
  stages: [
    stage(0, { component: "DirectoryLoader", started: 0, documents: [doc("a.pdf", ["iban"])] }),
    stage(1, { parent: 0, started: 0, documents: [doc("a.pdf", ["iban"], 3)] }),
    stage(2, {
      kind: "transform",
      component: "MaskIdentifiers",
      started: 1,
      documents: [doc("a.pdf", [])],
      warnings: [{ code: "empty_pages", message: "1 page with no text", sources: ["a.pdf"] }],
    }),
    stage(3, {
      kind: "embed",
      component: "OpenAIEmbeddings",
      started: 2,
      hosts: ["api.openai.com"],
      documents: [doc("a.pdf", ["name"], 9)],
    }),
  ],
};

describe("journeys", () => {
  const [a] = journeys(trace);

  it("follows a document through each step, the loader a directory loader ran for it once", () => {
    expect(a?.steps.map((s) => s.stage.index)).toEqual([1, 2, 3]);
    expect(a?.steps[0]?.entry.items).toBe(3);
  });

  it("says what each step removed and added", () => {
    expect(a?.steps[1]?.left).toEqual(["iban"]);
    expect(a?.steps[2]?.entered).toEqual(["name"]);
  });

  it("gathers its warnings, and where it was sent with what", () => {
    expect(a?.warnings.map((w) => w.code)).toEqual(["empty_pages"]);
    expect(a?.sent).toEqual({ hosts: ["api.openai.com"], identifiers: ["name"] });
  });
});
