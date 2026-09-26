import { required, sampleAudit } from "@/test/sample";
import { KEPT, OCR, canReveal, defaultSides, lineMarks, readersOf, sideName, sideText } from "./documentDiff";

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

  it("names each side by its reader, the document being the one on screen", () => {
    expect(sideName(report, { document: index, reader: "pypdf" })).toBe("pypdf");
    expect(sideName(report, { document: index, reader: KEPT })).toBe("pdfplumber (kept)");
  });

  it("compares a document read only one way with itself, never with another document", () => {
    const scanned = report.documents.findIndex((d) => d.relative_path.endsWith("supplier-invoices-scanned.pdf"));
    const [base, compare] = defaultSides(report, scanned);
    expect(base.document).toBe(scanned);
    expect(compare.document).toBe(scanned);
  });

  it("puts each identifier on the line that holds it, on its own page", () => {
    const msa = report.documents.findIndex((d) => d.relative_path.endsWith("master-services-agreement.pdf"));
    const side = { document: msa, reader: KEPT };
    const lines = sideText(report, side, "sentences").split("\n");
    const marks = lineMarks(report, side, "sentences");
    const placed = Object.entries(marks).flatMap(([line, found]) =>
      found.filter((m) => m.placed && m.ref.kind === "identifier").map((m) => ({ line: Number(line), m })),
    );
    expect(placed.length).toBeGreaterThan(0);
    for (const { line, m } of placed)
      expect(lines[line - 1]?.replace(/\s+/g, " ")).toContain(m.text.replace(/\s+/g, " "));
    const total = Object.values(marks).reduce(
      (n, found) => n + found.filter((m) => m.ref.kind === "identifier").length,
      0,
    );
    expect(total).toBe(required(report.documents[msa]).sensitive.matches.length);
  });

  it("shows the values only where a run kept them, and a masked copy otherwise", () => {
    expect(canReveal(annual)).toBe(false);
    const copy = structuredClone(report);
    const page = required(required(copy.documents[index]).extracted_text[0]);
    page.masked_text = page.text;
    page.text = `${page.text} VALUE`;
    for (const other of required(copy.documents[index]).extracted_text) other.masked_text ??= other.text;
    expect(canReveal(required(copy.documents[index]))).toBe(true);
    const side = { document: index, reader: KEPT };
    expect(sideText(copy, side, "lines")).not.toContain("VALUE");
    expect(sideText(copy, side, "lines", true)).toContain("VALUE");
  });
});
