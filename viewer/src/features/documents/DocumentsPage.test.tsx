import { render, screen, within } from "@testing-library/react";
import { sampleReport, sampleWithComparison } from "@/test/sample";
import { DocumentsPage } from "./DocumentsPage";

describe("DocumentsPage", () => {
  it("opens with the loaders and the one to use", () => {
    render(<DocumentsPage report={sampleReport()} open={null} />);
    const loaders = screen.getByRole("region", { name: "Loaders" });
    expect(within(loaders).getByRole("status")).toHaveTextContent("Use pypdf");
    const table = within(loaders).getByRole("table", { name: "Loaders compared" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("recommended")).toBeInTheDocument();
  });

  it("shows where a loader lost a fact, and the closest it came", () => {
    render(<DocumentsPage report={sampleReport()} open={null} />);
    expect(screen.getByText("kept")).toBeInTheDocument();
    expect(screen.getByText("missed")).toBeInTheDocument();
    expect(screen.getByText(/however arising/)).toBeInTheDocument();
  });

  it("lists every document, least ready first, each opening its comparison", () => {
    render(<DocumentsPage report={sampleReport()} open={null} />);
    const table = screen.getByRole("table", { name: "Documents" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(10);
    expect(rows[1]).toHaveTextContent("employee-record.pdf");
    expect(within(rows[1] as HTMLElement).getByRole("link", { name: "employee-record.pdf" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^#documents\/\d+$/),
    );
  });

  it("leaves the loaders out of a single-loader report", () => {
    const report = { ...sampleReport(), loader_comparison: null };
    render(<DocumentsPage report={report} open={null} />);
    expect(screen.queryByRole("region", { name: "Loaders" })).not.toBeInTheDocument();
  });

  it("says so when no loader can be recommended", () => {
    const report = sampleWithComparison();
    report.loader_comparison.recommended = null;
    report.loader_comparison.verdict = "They read the same documents differently.";
    render(<DocumentsPage report={report} open={null} />);
    expect(screen.getByRole("status")).not.toHaveTextContent("Use");
    expect(screen.queryByText("recommended")).not.toBeInTheDocument();
  });
});
