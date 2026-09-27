import { sampleTrace } from "@/test/trace";
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
