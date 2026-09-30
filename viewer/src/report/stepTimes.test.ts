import { describe, expect, it } from "vitest";
import { nestedReport } from "@/test/trace";
import { stepRows } from "./stepTimes";

describe("stepRows", () => {
  it("gives each step of a pipeline its time, a component called in a row as one step", () => {
    const rows = stepRows(nestedReport());
    expect(rows.map((row) => [row.name, row.kind])).toEqual([
      ["DirectoryLoader", "load"],
      ["RecursiveCharacterTextSplitter", "split"],
      ["OpenAIEmbeddings", "embed"],
    ]);
    expect(rows[0]?.seconds).toBeCloseTo(0.5);
  });
});
