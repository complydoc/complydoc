import { sampleAudit, sampleReport } from "@/test/sample";
import { traceReport } from "@/test/trace";
import { collectionsOf, leadRun, runKind, runTraits, type Loaded } from "./collections";
import type { ChunkRun, Report } from "./types";

function run(id: string, report: Report, started: string, target?: string): Loaded {
  return { id, name: `${id}.json`, report: { ...report, run: { ...report.run, started_at: started, target: target ?? report.run.target } } };
}

describe("collections", () => {
  it("groups reports by the folder they audited, runs newest first", () => {
    const audit = sampleAudit();
    const collections = collectionsOf([
      run("old", audit, "2026-09-01T10:00:00+01:00", "/data/contracts"),
      run("new", audit, "2026-09-20T10:00:00+01:00", "/data/contracts/"),
      run("other", audit, "2026-09-10T10:00:00+01:00", "/data/invoices"),
    ]);
    expect(collections.map((c) => [c.name, c.runs.map((r) => r.id)])).toEqual([
      ["contracts", ["new", "old"]],
      ["invoices", ["other"]],
    ]);
  });

  it("puts a loader comparison under the folder its documents share, not its loader's name", () => {
    const collections = collectionsOf([run("audit", sampleAudit(), "2026-09-01"), run("loaders", sampleReport(), "2026-09-02")]);
    // Both samples read viewer/sample/documents, so they are two runs of one folder.
    expect(collections.map((c) => [c.id, c.runs.map((r) => r.id)])).toEqual([
      ["viewer/sample/documents", ["loaders", "audit"]],
    ]);
  });

  it("takes a folder named through `..` as the same folder", () => {
    const audit = sampleAudit();
    const collections = collectionsOf([
      run("audit", audit, "2026-09-01", "/data/contracts"),
      run("spec", audit, "2026-09-02", "/data/tools/../contracts"),
    ]);
    expect(collections.map((c) => [c.id, c.runs.length])).toEqual([["/data/contracts", 2]]);
  });

  it("opens a folder on its newest run that read documents", () => {
    const chunks = { ...sampleAudit(), documents: [] };
    const [folder] = collectionsOf([
      run("audit", sampleAudit(), "2026-09-01", "/data/contracts"),
      run("chunks", chunks, "2026-09-02", "/data/contracts"),
    ]);
    expect(folder?.runs[0]?.id).toBe("chunks");
    expect(folder && leadRun(folder)?.id).toBe("audit");
    const [only] = collectionsOf([run("chunks", chunks, "2026-09-02", "/data/contracts")]);
    expect(only && leadRun(only)?.id).toBe("chunks");
  });

  it("names each kind of run, so runs of one folder are told apart by more than their time", () => {
    const audit = sampleAudit();
    expect(runKind(audit)).toBe("Audit");
    expect(runKind(sampleReport())).toBe("Loader comparison");
    expect(runKind({ ...audit, run: { ...audit.run, components_run: ["cost"] } })).toBe("Cost");
    expect(runKind({ ...audit, run: { ...audit.run, components_run: ["sensitive"] } })).toBe("Identifiers");
    expect(runKind({ ...audit, documents: [], chunks: [] })).toBe("Audit");
    const chunks = { ...audit, documents: [], run: { ...audit.run, components_run: [] } };
    expect(runKind({ ...chunks, chunks: [{} as ChunkRun] })).toBe("Chunks");
  });

  it("sums a folder up by its newest audit, over a newer run that measured part of it", () => {
    const [folder] = collectionsOf([
      run("audit", sampleAudit(), "2026-09-01", "/data/contracts"),
      run("loaders", { ...sampleReport(), run: { ...sampleReport().run, target: "/data/contracts" } }, "2026-09-02"),
    ]);
    expect(folder?.runs[0]?.id).toBe("loaders");
    expect(folder && leadRun(folder)?.id).toBe("audit");
  });

  it("names what set a run apart, values shown in the clear first", () => {
    const audit = sampleAudit();
    expect(runTraits({ ...audit, run: { ...audit.run, reveal_used: true, page_images_used: true } })).toEqual([
      "values revealed",
      "page pictures",
      ...runTraits(audit).filter((t) => t !== "page pictures"),
    ]);
  });

  it("puts a pipeline's runs together under its name, whatever folders they read", () => {
    const first = { ...traceReport(), run: { ...traceReport().run, target: "/data/contracts" } };
    const second = { ...traceReport(), run: { ...traceReport().run, target: "/data/finance" } };
    const collections = collectionsOf([run("a", first, "2026-09-01"), run("b", second, "2026-09-02")]);
    expect(collections).toHaveLength(1);
    expect(collections[0]?.name).toBe("contracts-ingest");
    expect(runKind(first)).toBe("Pipeline");
    expect(runTraits(first)).toContain("identifiers sent");
  });
});
