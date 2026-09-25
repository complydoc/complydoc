import { required, sampleAudit } from "@/test/sample";
import { KEPT, OCR, defaultSides, readersOf, sideName, sideText } from "./documentDiff";

const report = sampleAudit();
const index = report.documents.findIndex((d) => d.relative_path.endsWith("annual-report-2025.pdf"));
const annual = required(report.documents[index], "the annual report");

describe("document diffs", () => {
  it("offers every reading of a document, the kept one first", () => {
    const readers = readersOf(report, annual).map((r) => r.id);
    expect(readers[0]).toBe(KEPT);
    expect(readers).toContain("pypdf");
    expect(readers).toContain(OCR);
  });

  it("opens with the kept reading against the next reader", () => {
    expect(defaultSides(report, index)).toEqual([
      { document: index, reader: KEPT },
      { document: index, reader: "pypdf" },
    ]);
  });

  it("marks every page, so a hunk says which page it is on", () => {
    const text = sideText(report, { document: index, reader: KEPT }, "lines");
    const marks = text.split("\n").filter((line) => line.startsWith("# Page "));
    expect(marks).toHaveLength(annual.extracted_text.length);
  });

  it("lays text out one sentence per line, whatever the reader's line breaks", () => {
    const sentences = sideText(report, { document: index, reader: KEPT }, "sentences").split("\n");
    const lines = sideText(report, { document: index, reader: KEPT }, "lines").split("\n");
    expect(sentences.length).not.toBe(lines.length);
    expect(sentences.some((line) => line.endsWith("in the year."))).toBe(true);
  });

  it("names each side like a file", () => {
    expect(sideName(report, { document: index, reader: "pypdf" })).toBe("annual-report-2025.pdf · pypdf");
  });
});
