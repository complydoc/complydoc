import { sampleReport, sampleWithComparison } from "../test/sample";
import {
  bandCounts,
  bandOf,
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
      ["ready", 8],
      ["workable", 1],
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
    expect(categories[0]).toEqual({ category: "person_name", label: "Person name", count: 7 });
    expect(categories.find((c) => c.category === "iban")?.label).toBe("IBAN");
  });

  it("puts the least ready document first", () => {
    const rows = documentRows(sampleReport());
    expect(rows).toHaveLength(9);
    expect(rows[0]?.path).toContain("employee-record.pdf");
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
    expect(caveats.map((c) => c.area)).toEqual(["Hidden content", "Pages that could not be read", "Price provenance"]);
    expect(caveats[2]?.statements).toHaveLength(3);
  });
});
