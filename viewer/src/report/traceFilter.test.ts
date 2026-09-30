import { describe, expect, it } from "vitest";
import { sampleTrace, stage } from "@/test/trace";
import { filterSpans, NO_FILTER } from "./traceFilter";
import { spansOf } from "./traceTree";

const trace = {
  ...sampleTrace(),
  stages: [
    stage(0, { parameters: { file_path: "a.pdf" }, started: 0, seconds: 0.2, identifiers: [] }),
    stage(1, {
      parameters: { file_path: "b.pdf" },
      started: 0.2,
      seconds: 0.3,
      warnings: [{ code: "empty_document", message: "1 document loaded no text", sources: ["b.pdf"] }],
      identifiers: [],
    }),
    stage(2, {
      kind: "split",
      component: "RecursiveCharacterTextSplitter",
      method: "split_documents",
      started: 0.5,
      identifiers: [{ fingerprint: "f1", label: "IBAN", masked: "GB•• 4432", severity: "high", occurrences: 1 }],
    }),
  ],
};

const indexes = (spans: ReturnType<typeof spansOf>): number[] =>
  spans.flatMap((s) => [s.stage.index, ...indexes(s.children)]).filter((i) => i >= 0);

describe("filterSpans", () => {
  it("keeps every call without a filter", () => {
    expect(indexes(filterSpans(spansOf(trace), NO_FILTER))).toEqual([0, 1, 2]);
  });

  it("keeps the calls that match, under the rows they sit in", () => {
    const found = filterSpans(spansOf(trace), { ...NO_FILTER, query: "b.pdf" });
    expect(indexes(found)).toEqual([1]);
    expect(found[0]?.stage.kind).toBe("run");
  });

  it("narrows to the calls with a warning", () => {
    expect(indexes(filterSpans(spansOf(trace), { ...NO_FILTER, problems: true }))).toEqual([1]);
  });

  it("narrows to the calls that passed on an identifier", () => {
    expect(indexes(filterSpans(spansOf(trace), { ...NO_FILTER, identifiers: true }))).toEqual([2]);
  });
});
