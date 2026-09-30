import { sampleReport } from "@/test/sample";
import { traceOf } from "./auditTrace";

describe("traceOf, for a run complydoc made itself", () => {
  it("lets a document span every step under it, loaders timed on their own included", () => {
    const report = sampleReport();
    // Each loader's own reading takes longer than the document's time on its own.
    for (const document of report.documents)
      for (const reading of document.extractions) reading.seconds = (document.timing?.total_seconds ?? 0) + 1;
    const trace = traceOf(report);
    if (!trace) throw new Error("a comparison with timings has a trace");
    const byIndex = new Map(trace.stages.map((stage) => [stage.index, stage]));
    for (const stage of trace.stages) {
      const parent = stage.parent === null || stage.parent === undefined ? undefined : byIndex.get(stage.parent);
      if (!parent) continue;
      const end = (stage.started ?? 0) + stage.seconds;
      expect(end).toBeLessThanOrEqual((parent.started ?? 0) + parent.seconds + 1e-9);
    }
  });
});
