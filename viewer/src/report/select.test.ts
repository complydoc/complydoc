import { required, sampleAudit, sampleReport, sampleWithComparison } from "@/test/sample";
import {
  bandCounts,
  bandOf,
  agreementTone,
  bandTone,
  categoriesByCount,
  documentRows,
  rankedLoaders,
  returnedBySomeOnly,
  severityTone,
  summaryCaveats,
} from "./select";

describe("select", () => {
  it("counts only the bands that have documents, best first", () => {
    expect(bandCounts(sampleReport()).map((b) => [b.key, b.count])).toEqual([
      ["ready", 3],
      ["workable", 3],
    ]);
  });

  it("bands a score on complydoc's thresholds", () => {
    expect([100, 75, 74.9, 50, 25, 0].map(bandOf)).toEqual([
      "ready",
      "ready",
      "workable",
      "workable",
      "needs work",
      "not ready",
    ]);
    expect(bandOf(null)).toBeNull();
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

  it("orders loaders by the comparison's ranking", () => {
    const comparison = sampleWithComparison().loader_comparison;
    comparison.ranked = ["pdfplumber", "pypdf"];
    expect(rankedLoaders(comparison).map((l) => l.name)).toEqual(["pdfplumber", "pypdf"]);
  });

  it("merges documents and metadata keys only some loaders returned", () => {
    const comparison = sampleWithComparison().loader_comparison;
    comparison.documents = { "a.pdf": ["pypdf"] };
    expect(returnedBySomeOnly(comparison)).toEqual([
      { kind: "Document", name: "a.pdf", loaders: ["pypdf"] },
      { kind: "Metadata key", name: "file_path", loaders: ["pdfplumber"] },
      { kind: "Metadata key", name: "page_label", loaders: ["pypdf"] },
    ]);
  });

  it("groups the summary's caveats by area and leaves the reader ones out", () => {
    const caveats = summaryCaveats(sampleReport());
    expect(caveats.map((c) => c.area)).toEqual(["Hidden content", "Pages that could not be read"]);
    expect(caveats[1]?.statements).toHaveLength(1);
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

  it("colours agreement on complydoc's threshold", () => {
    expect([1, 0.95, 0.8, 0.51].map(agreementTone)).toEqual(["good", "good", "warn", "bad"]);
  });

  it("finds each document's score, and calls a reading reordered only where it differs", () => {
    const rows = documentRows(sampleAudit());
    expect(rows.every((row) => row.score !== null)).toBe(true);
    expect(rows.find((row) => row.path === "annual-report-2025.pdf")).toMatchObject({ reordered: false });
  });
});
