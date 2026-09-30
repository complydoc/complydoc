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
});
