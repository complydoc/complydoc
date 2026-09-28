import { required, sampleAudit, sampleReport } from "@/test/sample";
import { bandCounts, bandOf, agreementTone, bandTone, categoriesByCount, documentRows, severityTone } from "./select";

describe("select", () => {
  it("counts only the bands that have documents, best first", () => {
    expect(bandCounts(sampleReport()).map((b) => [b.key, b.count])).toEqual([
      ["ready", 3],
      ["workable", 3],
    ]);
  });

  it("bands a score on the thresholds the report carries", () => {
    const { thresholds } = sampleAudit();
    expect([100, 75, 74.9, 50, 25, 0].map((score) => bandOf(thresholds, score))).toEqual([
      "ready",
      "ready",
      "workable",
      "workable",
      "needs work",
      "not ready",
    ]);
    expect(bandOf(thresholds, null)).toBeNull();
    // A report scored on other lines is banded on those, not on a copy of today's.
    const stricter = { ...thresholds, bands: { ready: 90, workable: 60, "needs work": 30, "not ready": 0 } };
    expect(bandOf(stricter, 80)).toBe("workable");
  });

  it("gives each band and severity a tone", () => {
    expect(bandTone("ready")).toBe("good");
    expect(bandTone(null)).toBe("neutral");
    expect(severityTone("high")).toBe("bad");
    expect(severityTone("low")).toBe("neutral");
  });

  it("orders categories by how often they were found", () => {
    const categories = categoriesByCount(sampleReport());
    expect(categories[0]).toEqual({ category: "person_name", label: "Person name", count: 19 });
    expect(categories.find((c) => c.category === "iban")?.label).toBe("IBAN");
  });

  it("puts the least ready document first", () => {
    const rows = documentRows(sampleReport());
    expect(rows).toHaveLength(6);
    expect(rows[0]?.path).toContain("master-services-agreement.pdf");
    expect(rows[0]?.highest).toBe("high");
  });

  it("says how far the readers of each document agree, and whether one reordered it", () => {
    const rows = documentRows(sampleAudit());
    const contract = rows.find((row) => row.path.endsWith("master-services-agreement.pdf"));
    expect(contract?.agreement).toBeCloseTo(0.3385);
    expect(contract?.reordered).toBe(true);

    const report = sampleAudit();
    const first = required(report.documents[0]);
    first.extractions = first.extractions.slice(0, 1);
    expect(documentRows(report).find((row) => row.index === 0)?.agreement).toBeNull();
    expect(rows.every((row, _, all) => all.filter((r) => r.index === row.index).length === 1)).toBe(true);
  });

  it("colours agreement on the report's own line", () => {
    const { thresholds } = sampleAudit();
    expect([1, 0.95, 0.8, 0.51].map((value) => agreementTone(thresholds, value))).toEqual([
      "good",
      "good",
      "warn",
      "bad",
    ]);
    expect(agreementTone({ ...thresholds, similar_enough: 0.99 }, 0.97)).toBe("warn");
  });

  it("finds each document's score, and calls a reading reordered only where it differs", () => {
    const rows = documentRows(sampleAudit());
    expect(rows.every((row) => row.score !== null)).toBe(true);
    expect(rows.find((row) => row.path === "annual-report-2025.pdf")).toMatchObject({ reordered: false });
  });
});
