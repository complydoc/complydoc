import { screen, within } from "@testing-library/react";
import { renderPage } from "@/test/render";
import { sampleReport, sampleWithComparison } from "@/test/sample";
import { LoadersPage } from "./LoadersPage";

describe("LoadersPage", () => {
  it("opens with the loaders and the one to use", () => {
    renderPage(<LoadersPage report={sampleReport()} />);
    const loaders = screen.getByRole("region", { name: "Loaders" });
    expect(within(loaders).getByRole("status")).toHaveTextContent("Use pypdf");
    const table = within(loaders).getByRole("table", { name: "Loaders compared" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("recommended")).toBeInTheDocument();
  });

  it("shows where a loader lost a fact, and the closest it came", () => {
    renderPage(<LoadersPage report={sampleReport()} />);
    expect(screen.getAllByText("kept")).toHaveLength(2);
    expect(screen.getAllByText("missed")).toHaveLength(2);
    expect(screen.getByText(/The supplier shall provide the services 5\.1/)).toBeInTheDocument();
  });

  it("says a run that compared no loaders did not, and how to", () => {
    const report = { ...sampleReport(), loader_comparison: null };
    renderPage(<LoadersPage report={report} />);
    expect(screen.queryByRole("region", { name: "Loaders" })).not.toBeInTheDocument();
    expect(screen.getByText("No loader comparison in this run")).toBeInTheDocument();
    expect(screen.getByText("complydoc compare-loaders loaders.yaml")).toBeInTheDocument();
  });

  it("says so when no loader can be recommended", () => {
    const report = sampleWithComparison();
    report.loader_comparison.recommended = null;
    report.loader_comparison.verdict = "They read the same documents differently.";
    renderPage(<LoadersPage report={report} />);
    expect(screen.getByRole("status")).not.toHaveTextContent("Use");
    expect(screen.queryByText("recommended")).not.toBeInTheDocument();
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
    renderPage(<LoadersPage report={report} />);
    expect(screen.getByRole("status")).toHaveTextContent("A loader per file type");
    const table = screen.getByRole("table", { name: "Loaders by file type" });
    const [, pdf, excel] = within(table).getAllByRole("row");
    expect(pdf).toHaveTextContent("PDF");
    expect(pdf).toHaveTextContent("2 read · 80% alike");
    expect(pdf).toHaveTextContent("failed on 1");
    expect(within(pdf as HTMLElement).getByText("pypdf", { selector: "[data-slot=badge]" })).toBeInTheDocument();
    expect(excel).toHaveTextContent("skipped");
    expect(excel).toHaveTextContent("none meant for it");
  });

  it("leaves the file-type table out of a comparison of one type", () => {
    renderPage(<LoadersPage report={sampleReport()} />);
    expect(screen.queryByRole("table", { name: "Loaders by file type" })).not.toBeInTheDocument();
  });
});
