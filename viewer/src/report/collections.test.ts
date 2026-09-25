import { sampleAudit, sampleReport } from "@/test/sample";
import { changeBetween, collectionsOf, type Loaded } from "./collections";
import type { Report } from "./types";

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

  it("says what changed between two runs of a folder", () => {
    const newer = sampleAudit();
    const older = { ...newer, documents: newer.documents.slice(1), aggregate: { ...newer.aggregate, sensitive_total: 10 } };
    const change = changeBetween(newer, older);
    expect(change.added).toEqual([newer.documents[0]?.relative_path]);
    expect(change.removed).toEqual([]);
    expect(change.sensitive).toEqual({ before: 10, after: newer.aggregate.sensitive_total });
  });

  it("puts a loader comparison under the folder its documents share, not its loader's name", () => {
    const collections = collectionsOf([run("audit", sampleAudit(), "2026-09-01"), run("loaders", sampleReport(), "2026-09-02")]);
    // Both samples read viewer/sample/documents, so they are two runs of one folder.
    expect(collections.map((c) => [c.id, c.runs.map((r) => r.id)])).toEqual([
      ["viewer/sample/documents", ["loaders", "audit"]],
    ]);
  });
});
