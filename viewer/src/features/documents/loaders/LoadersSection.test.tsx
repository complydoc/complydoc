import { screen, within } from "@testing-library/react";
import { renderPage } from "@/test/render";
import { sampleReport, sampleWithComparison } from "@/test/sample";
import { DocumentsPage } from "../DocumentsPage";

describe("Loaders compared, on the Documents page", () => {
  it("opens with the loaders side by side, and leaves the choice to the reader", () => {
    const report = sampleReport();
    renderPage(<DocumentsPage open={null} report={report} />);
    const loaders = screen.getByRole("region", { name: "Loaders compared" });
    const table = within(loaders).getByRole("table", { name: "Loaders on Every file" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    // The report still carries its own verdict; the page does not repeat it.
    expect(report.loader_comparison?.recommended).toBeTruthy();
    expect(within(loaders).queryByText(/^use$/i)).not.toBeInTheDocument();
    expect(within(loaders).queryByText(/^Use /)).not.toBeInTheDocument();
  });

  it("says which loader did not keep an expected fact", () => {
    const report = sampleReport();
    renderPage(<DocumentsPage open={null} report={report} />);
    const check = report.loader_comparison?.facts.find((f) => Object.values(f.found).some((m) => m !== "exact"));
    if (!check) throw new Error("the sample has a fact a loader missed");
    expect(screen.getByText(`“${check.fact}”`)).toBeInTheDocument();
  });

  it("lists the files the loaders read differently, each a way to its diff", () => {
    renderPage(<DocumentsPage open={null} report={sampleReport()} />);
    const links = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("#documents/"));
    expect(links.length).toBeGreaterThan(0);
  });

  it("leaves it out of a run that compared no loaders, which lists its documents alone", () => {
    const report = { ...sampleReport(), loader_comparison: null };
    renderPage(<DocumentsPage open={null} report={report} />);
    expect(screen.queryByRole("region", { name: "Loaders compared" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Documents" })).toBeInTheDocument();
  });

  it("shows a loader per file type, and which ones skipped a type", () => {
    const report = sampleWithComparison();
    const row = (name: string, documents: number, failures: Record<string, string> = {}) => ({
      name,
      documents,
      pages: documents,
      characters: 100,
      seconds: 0.1,
      similarity: 0.8,
      failures,
      facts_found: null,
      error: null,
    });
    report.loader_comparison.recommended = null;
    report.loader_comparison.verdict = "Each file type is decided on its own.";
    report.loader_comparison.formats = [
      {
        format: "pdf",
        label: "PDF",
        documents: 2,
        loaders: [row("pypdf", 2), row("pdfplumber", 1, { "b.pdf": "RuntimeError: cannot parse" })],
        skipped_by: [],
        facts: 0,
        recommended: "pypdf",
        verdict: "pypdf opened all 2 documents",
        ranked: ["pypdf", "pdfplumber"],
      },
      {
        format: "xlsx",
        label: "Excel",
        documents: 1,
        loaders: [],
        skipped_by: ["pypdf", "pdfplumber"],
        facts: 0,
        recommended: null,
        verdict: "none of the loaders is meant for Excel files",
        ranked: [],
      },
    ];
    report.loader_comparison.formats.push({
      format: "docx",
      label: "Word",
      documents: 1,
      loaders: [row("docx2txt", 1)],
      skipped_by: ["pypdf", "pdfplumber"],
      facts: 0,
      recommended: null,
      verdict: "docx2txt is the only loader meant for Word files",
      ranked: ["docx2txt"],
    });
    renderPage(<DocumentsPage open={null} report={report} />);
    const pdf = screen.getByRole("table", { name: "Loaders on PDF" });
    expect(within(pdf).getByText("failed on 1", { exact: false })).toBeInTheDocument();
    // A type one loader read has nothing to compare; a type none was meant for is named.
    expect(screen.queryByRole("table", { name: "Loaders on Word" })).not.toBeInTheDocument();
    expect(screen.getByText(/One loader each:/)).toHaveTextContent("Word by docx2txt");
    expect(screen.getByText("No loader was meant for Excel.")).toBeInTheDocument();
  });
});
