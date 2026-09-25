import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { sampleShare } from "@/test/sample";
import { DocumentsPage } from "./DocumentsPage";

describe("a folder audited with everything under it", () => {
  it("shows the folders it holds, each adding up its documents", () => {
    renderPage(<DocumentsPage report={sampleShare()} open={null} />);
    const table = screen.getByRole("table", { name: "Documents" });
    const finance = within(table).getByRole("row", { name: /^finance/ });
    // Two invoices and the annual report, under finance/invoices/2026 and finance/reports.
    expect(within(finance).getByText("3")).toBeInTheDocument();
    expect(finance).toHaveTextContent(/\$\d/);
    expect(within(table).getByText("invoices/2026")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "rechnungen-2026-de.pdf" })).toBeInTheDocument();
  });

  it("folds a folder away, and finds a document inside a folded one", async () => {
    renderPage(<DocumentsPage report={sampleShare()} open={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Close finance" }));
    expect(screen.queryByRole("link", { name: "annual-report-2025.pdf" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search documents" }), "annual");
    expect(screen.getByRole("link", { name: "annual-report-2025.pdf" })).toBeInTheDocument();
  });
});
