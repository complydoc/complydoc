import { describe, expect, it } from "vitest";
import { sampleTrace, stage } from "@/test/trace";
import { spansOf } from "./traceTree";

describe("spansOf for a pipeline", () => {
  const trace = {
    ...sampleTrace(),
    stages: [
      stage(0, { parameters: { file_path: "a.pdf" }, started: 0, seconds: 0.2, usd: null }),
      stage(1, { parameters: { file_path: "b.pdf" }, started: 0.2, seconds: 0.3, usd: null }),
      stage(2, {
        kind: "split",
        component: "RecursiveCharacterTextSplitter",
        method: "split_documents",
        started: 0.5,
        seconds: 0.1,
      }),
    ],
  };

  it("hangs every step from the run, a component called in a row under one step", () => {
    const [run, ...rest] = spansOf(trace);
    expect(rest).toEqual([]);
    expect(run?.stage.kind).toBe("run");
    expect(run?.stage.seconds).toBeCloseTo(0.6);
    const [loads, split] = run?.children ?? [];
    expect(loads?.label).toBe("2 calls");
    expect(loads?.depth).toBe(1);
    expect(loads?.stage.seconds).toBeCloseTo(0.5);
    expect(loads?.children.map((c) => [c.stage.index, c.depth])).toEqual([
      [0, 2],
      [1, 2],
    ]);
    expect(split?.stage.index).toBe(2);
  });

  it("gives the rows it adds indexes no call has", () => {
    const [run] = spansOf(trace);
    expect(run?.stage.index).toBeLessThan(0);
    expect(run?.children[0]?.stage.index).toBeLessThan(0);
    expect(run?.stage.index).not.toBe(run?.children[0]?.stage.index);
  });

  it("groups the calls a step makes inside it the same way", () => {
    const read = (index: number, file: string, started: number) =>
      stage(index, {
        component: "PDFReader",
        method: "load_data",
        parameters: { file_path: file },
        started,
        seconds: 0.1,
        parent: 0,
        warnings: index === 2 ? [{ code: "empty_document", sources: [file], message: "no text" }] : [],
      });
    const nestedTrace = {
      ...sampleTrace(),
      stages: [
        stage(0, { component: "SimpleDirectoryReader", method: "load_data", started: 0, seconds: 0.5 }),
        read(1, "a.pdf", 0),
        read(2, "b.pdf", 0.1),
        read(3, "c.pdf", 0.2),
      ],
    };
    const [run] = spansOf(nestedTrace);
    const reader = run?.children[0];
    expect(reader?.children).toHaveLength(1);
    const calls = reader?.children[0];
    expect(calls?.label).toBe("3 calls");
    expect(calls?.depth).toBe(2);
    expect(calls?.children.map((c) => c.depth)).toEqual([3, 3, 3]);
    // What one file warned of shows on the row that stands for them.
    expect(calls?.stage.warnings?.map((w) => w.code)).toEqual(["empty_document"]);
  });
});
