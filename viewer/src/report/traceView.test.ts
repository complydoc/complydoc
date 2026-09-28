import { nestedTrace, sampleTrace, stage } from "@/test/trace";
import { spansOf, timeByKind } from "./traceTree";
import { changeBetween, pipelineShape, sendingStep, stepsOf, trailsOf } from "./traceView";

describe("traceView", () => {
  it("makes calls of the same loader one after another one step, and says which settings differed", () => {
    const steps = stepsOf(sampleTrace());
    expect(steps.map((s) => s.kind)).toEqual(["load", "transform", "split", "embed"]);
    const [load] = steps;
    expect(load?.stages).toHaveLength(2);
    expect(load?.documentsOut).toBe(4);
    expect(load?.parameters).toEqual({ mode: "page" });
    expect(load?.varying).toEqual({ file_path: 2 });
  });

  it("counts only what both steps could see as entering or leaving", () => {
    const [load, strip, split, embed] = stepsOf(sampleTrace());
    if (!load || !strip || !split || !embed) throw new Error("four steps");
    // The name was found by the name model; the patterns that read the next step could not see it.
    expect(changeBetween(load, strip).left).toEqual([]);
    expect(changeBetween(load, strip).pathKeysRemoved).toEqual(["source"]);
    expect(changeBetween(split, embed).entered).toEqual([]);
  });

  it("follows each identifier along the steps, blank where a step could not have seen it", () => {
    const trails = trailsOf(stepsOf(sampleTrace()));
    const name = trails.find((t) => t.identifier.label === "Person name");
    expect(name?.cells).toEqual([1, null, null, 1]);
    const iban = trails.find((t) => t.identifier.label === "IBAN");
    expect(iban?.cells).toEqual([1, 1, 1, 1]);
    expect(trails[0]?.reachedEnd).toBe(true);
  });

  it("names the step that sent text away, and the settings that shape a run", () => {
    const steps = stepsOf(sampleTrace());
    expect(sendingStep(steps)?.component).toBe("OpenAIEmbeddings");
    expect(pipelineShape(sampleTrace())).toBe(
      "PyPDFLoader → StripPathMetadata → RecursiveCharacterTextSplitter (chunk_size 400, chunk_overlap 0) → OpenAIEmbeddings",
    );
  });
});

describe("timeByKind", () => {
  it("sums the time of the innermost calls by their kind, largest first", () => {
    const split = timeByKind(nestedTrace());
    // The directory loader's time is its two files', counted once.
    expect(split.map((part) => part.kind)).toEqual(["load", "embed", "split"]);
    expect(split[0]?.seconds).toBeCloseTo(0.5);
    expect(split.reduce((sum, part) => sum + part.share, 0)).toBeCloseTo(1);
  });
});

describe("spansOf for an audit", () => {
  it("groups the documents into the folders they sit in, each with its documents' figures", () => {
    const document = (index: number, path: string) =>
      stage(index, {
        kind: "document",
        component: path.split("/").pop() ?? path,
        sources: [path],
        started: index,
        seconds: 1,
      });
    const trace = {
      ...sampleTrace(),
      kind: "audit" as const,
      stages: [
        document(0, "contracts/2025/a.pdf"),
        document(1, "contracts/2025/b.pdf"),
        document(2, "contracts/c.pdf"),
        document(3, "top.pdf"),
      ],
    };
    const roots = spansOf(trace);
    expect(roots.map((span) => span.stage.component)).toEqual(["contracts/", "top.pdf"]);
    const contracts = roots[0];
    expect(contracts?.stage.documents_out).toBe(3);
    expect(contracts?.children.map((span) => [span.stage.component, span.depth])).toEqual([
      ["2025/", 1],
      ["c.pdf", 1],
    ]);
    // From the first document's start to the last one's end.
    expect(contracts?.stage.seconds).toBe(3);
  });
});
