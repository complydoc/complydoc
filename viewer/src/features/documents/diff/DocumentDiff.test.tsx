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
    expect(screen.getByText(/annual-report-2025\.pdf · pdfplumber \(kept\)/)).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Compare" })).getByRole("combobox", { name: "Compare reader" })).toHaveTextContent(
      "pypdf",
    );
  });

  it("says so when the two sides read the same", async () => {
    const report = sampleAudit();
    renderPage(<DocumentsPage report={report} open="0" />);
    await userEvent.click(screen.getByRole("radio", { name: "Diff" }));
    await userEvent.click(screen.getByRole("combobox", { name: "Compare reader" }));
    await userEvent.click(await screen.findByRole("option", { name: /\(kept\)/ }));
    expect(await screen.findByText(/No differences/, {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
