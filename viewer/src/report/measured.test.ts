import { sampleAudit, sampleReport } from "@/test/sample";
import { commandFor, measured } from "./measured";
import { attentionDocuments } from "./home";

describe("measured", () => {
  it("reads the components from the run, and takes an older report to have run them all", () => {
    const report = sampleAudit();
    report.run.components_run = ["cost"];
    expect(measured(report, "cost")).toBe(true);
    expect(measured(report, "sensitive")).toBe(false);
    expect(measured(report, "readiness")).toBe(false);

    delete report.run.components_run;
    expect(measured(report, "sensitive")).toBe(true);
  });

  it("finds loaders, chunks and documents from what the report holds", () => {
    const report = sampleReport();
    expect(measured(report, "loaders")).toBe(true);
    expect(measured(report, "chunks")).toBe(false);
    expect(measured({ ...report, loader_comparison: null }, "loaders")).toBe(false);
    expect(measured({ ...report, documents: [] }, "documents")).toBe(false);
  });
});

describe("commandFor", () => {
  it("names the folder the run read, quoted only when a shell would split it", () => {
    const report = sampleAudit();
    report.run.target = "/work/contracts";
    expect(commandFor(report, "sensitive")).toBe("complydoc sensitive /work/contracts");
    report.run.target = "/work/vendor contracts";
    expect(commandFor(report, "cost")).toBe("complydoc cost '/work/vendor contracts'");
    report.run.target = "/work/o'neil";
    expect(commandFor(report, "readiness")).toBe("complydoc readiness '/work/o'\\''neil'");
  });
});

describe("what a run did not measure", () => {
  it("is never a reason to look at a document", () => {
    const report = sampleAudit();
    report.run.components_run = ["cost"];
    const reasons = attentionDocuments(report).flatMap((row) => row.reasons.map((r) => r.label));
    expect(reasons.some((label) => label.startsWith("readiness"))).toBe(false);
  });
});
