import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { sampleAudit } from "@/test/sample";
import { DocumentsPage } from "../DocumentsPage";

describe("the diff view", () => {
  it("shows a document's two readings as a git diff, with lines added and removed", async () => {
    const report = sampleAudit();
    const index = report.documents.findIndex((d) => d.relative_path.endsWith("annual-report-2025.pdf"));
    renderPage(<DocumentsPage report={report} open={String(index)} />);
    await userEvent.click(screen.getByRole("radio", { name: "Diff" }));
    const changed = await screen.findByLabelText("Lines changed", {}, { timeout: 5000 });
    expect(changed).toHaveTextContent(/\+\d+\s*−\d+/);
    expect(changed.parentElement).toHaveTextContent(/pdfplumber \(kept\)\s*→\s*pypdf/);
    expect(screen.getByRole("combobox", { name: "Compare reader" })).toHaveTextContent("pypdf");
  });

  it("compares extraction methods of this document only, each with what it costs", async () => {
    const report = sampleAudit();
    renderPage(<DocumentsPage report={report} open="0" />);
    await userEvent.click(screen.getByRole("radio", { name: "Diff" }));
    // No document to pick: the diff is always of the document on screen.
    expect(screen.queryByRole("combobox", { name: /document/i })).not.toBeInTheDocument();
    const base = screen.getByRole("combobox", { name: "Base reader" });
    expect(within(base.parentElement as HTMLElement).getByTitle(/The whole document/)).toHaveTextContent(/^\$\d/);
    // A page's cost means nothing across the whole diff, so the page and document figures step aside.
    expect(screen.queryByRole("group", { name: "Cost and time" })).not.toBeInTheDocument();
  });

  it("says so when the two sides read the same", async () => {
    const report = sampleAudit();
    renderPage(<DocumentsPage report={report} open="0" />);
    await userEvent.click(screen.getByRole("radio", { name: "Diff" }));
    await userEvent.click(screen.getByRole("combobox", { name: "Compare reader" }));
    await userEvent.click(await screen.findByRole("option", { name: /\(kept\)/ }));
    expect(await screen.findByText(/No differences/, {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("scrolls to the page picked, and follows the page as it is scrolled", async () => {
    const report = sampleAudit();
    const index = report.documents.findIndex((d) => d.relative_path.endsWith("annual-report-2025.pdf"));
    renderPage(<DocumentsPage report={report} open={String(index)} />);
    await userEvent.click(screen.getByRole("radio", { name: "Diff" }));
    const scroller = await screen.findByTestId("diff-scroller", {}, { timeout: 5000 });
    const scrolled = vi.spyOn(scroller, "scrollTo");
    await userEvent.click(screen.getByRole("link", { name: /page 2|^2$/i }));
    await vi.waitFor(() => expect(scrolled).toHaveBeenCalled());
  });
});
