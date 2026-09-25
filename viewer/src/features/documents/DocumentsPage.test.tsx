import { screen, within } from "@testing-library/react";
import { renderPage } from "@/test/render";
import { sampleReport, sampleWithComparison } from "@/test/sample";
import { DocumentsPage } from "./DocumentsPage";

describe("DocumentsPage", () => {
  it("opens with the loaders and the one to use", () => {
    renderPage(<DocumentsPage report={sampleReport()} open={null} />);
    const loaders = screen.getByRole("region", { name: "Loaders" });
    expect(within(loaders).getByRole("status")).toHaveTextContent("Use pypdf");
    const table = within(loaders).getByRole("table", { name: "Loaders compared" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("recommended")).toBeInTheDocument();
  });

  it("shows where a loader lost a fact, and the closest it came", () => {
    renderPage(<DocumentsPage report={sampleReport()} open={null} />);
    expect(screen.getAllByText("kept")).toHaveLength(2);
    expect(screen.getAllByText("missed")).toHaveLength(2);
    expect(screen.getByText(/The supplier shall provide the services 5\.1/)).toBeInTheDocument();
  });

  it("lists every document by name, each opening its comparison, with its cost and time", () => {
    renderPage(<DocumentsPage report={sampleReport()} open={null} />);
    const table = screen.getByRole("table", { name: "Documents" });
    const rows = within(table).getAllByRole("row");
    // The header, the folder the documents are in, and the six documents.
    expect(rows).toHaveLength(8);
    expect(rows[1]).toHaveTextContent("viewer/sample/documents");
    expect(rows[2]).toHaveTextContent("annual-report-2025.pdf");
    expect(within(rows[2] as HTMLElement).getByRole("link", { name: "annual-report-2025.pdf" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^#documents\/\d+$/),
    );
    expect(within(table).getByRole("columnheader", { name: /Cost/ })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /Time to read/ })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent(/\$\d/);
    expect(rows[2]).toHaveTextContent(/\$\d/);
  });

  it("leaves the loaders out of a single-loader report", () => {
    const report = { ...sampleReport(), loader_comparison: null };
    renderPage(<DocumentsPage report={report} open={null} />);
    expect(screen.queryByRole("region", { name: "Loaders" })).not.toBeInTheDocument();
  });

  it("says so when no loader can be recommended", () => {
    const report = sampleWithComparison();
    report.loader_comparison.recommended = null;
    report.loader_comparison.verdict = "They read the same documents differently.";
    renderPage(<DocumentsPage report={report} open={null} />);
    expect(screen.getByRole("status")).not.toHaveTextContent("Use");
    expect(screen.queryByText("recommended")).not.toBeInTheDocument();
  });
});
