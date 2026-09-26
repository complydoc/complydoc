import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { sampleAudit } from "@/test/sample";
import { wide } from "@/test/setup";
import { DocumentsPage } from "../DocumentsPage";

describe("the diff view", () => {
  it("shows a document's two readings as a git diff, with lines added and removed", async () => {
    const report = sampleAudit();
    const index = report.documents.findIndex((d) => d.relative_path.endsWith("annual-report-2025.pdf"));
    renderPage(<DocumentsPage report={report} open={String(index)} />);
    const changed = await screen.findByLabelText("Lines changed", {}, { timeout: 5000 });
    expect(changed).toHaveTextContent(/\+\d+\s*−\d+/);
    expect(screen.getByRole("combobox", { name: "Compare reader" })).toHaveTextContent("pypdf");
  });

  it("compares extraction methods of this document only", async () => {
    const report = sampleAudit();
    renderPage(<DocumentsPage report={report} open="0" />);
    // No document to pick: the diff is always of the document on screen.
    expect(screen.queryByRole("combobox", { name: /document/i })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Base reader" })).toBeInTheDocument();
  });

  it("says so when the two sides read the same", async () => {
    const report = sampleAudit();
    renderPage(<DocumentsPage report={report} open="0" />);
    await userEvent.click(screen.getByRole("combobox", { name: "Compare reader" }));
    await userEvent.click(await screen.findByRole("option", { name: /\(kept\)/ }));
    expect(await screen.findByText("The two read the same", {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it("scrolls to the page picked, and follows the page as it is scrolled", async () => {
    wide();
    const report = sampleAudit();
    const index = report.documents.findIndex((d) => d.relative_path.endsWith("annual-report-2025.pdf"));
    renderPage(<DocumentsPage report={report} open={String(index)} />);
    const scroller = await screen.findByTestId("diff-scroller", {}, { timeout: 5000 });
    const scrolled = vi.spyOn(scroller, "scrollTo");
    await userEvent.click(screen.getByRole("link", { name: "Go to next page" }));
    await vi.waitFor(() => expect(scrolled).toHaveBeenCalled());
  });
});
