import { screen, within } from "@testing-library/react";
import { renderPage } from "@/test/render";
import { sampleReport } from "@/test/sample";
import { DocumentsPage } from "./DocumentsPage";

describe("DocumentsPage", () => {
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

  it("leaves the loaders to their own page", () => {
    renderPage(<DocumentsPage report={sampleReport()} open={null} />);
    expect(screen.queryByRole("region", { name: "Loaders" })).not.toBeInTheDocument();
  });

  it("says a chunks run kept no documents, and how to audit them", () => {
    const report = { ...sampleReport(), documents: [] };
    renderPage(<DocumentsPage report={report} open={null} />);
    expect(screen.getByText("No documents in this run")).toBeInTheDocument();
    expect(screen.getByText(/^complydoc audit /)).toBeInTheDocument();
  });
});
