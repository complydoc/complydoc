import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { sampleAudit, sampleReport } from "@/test/sample";
import type { Report } from "@/report/types";
import { DocumentDetail } from "./DocumentDetail";

function open(report: Report, name: string) {
  const document = report.documents.find((d) => d.relative_path.endsWith(name));
  if (!document) throw new Error(`no ${name} in the sample`);
  render(
    <TooltipProvider>
      <DocumentDetail report={report} document={document} />
    </TooltipProvider>,
  );
}

describe("DocumentDetail", () => {
  it("names the document and how far its readers agree", () => {
    open(sampleAudit(), "terms-and-conditions.pdf");
    expect(screen.getByRole("link", { name: "Documents" })).toHaveAttribute("href", "#documents");
    expect(screen.getByRole("heading", { name: "terms-and-conditions.pdf" })).toBeInTheDocument();
    expect(screen.getByText(/pypdf 51%/)).toHaveTextContent("reordered");
  });

  it("shows the page beside two readings, the kept one against the next reader", () => {
    open(sampleAudit(), "terms-and-conditions.pdf");
    expect(screen.getByRole("figure", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Left reading" })).toHaveTextContent("pdfplumber");
    expect(screen.getByRole("combobox", { name: "Right reading" })).toHaveTextContent("pypdf");
    expect(screen.getAllByText(/\d+ differences$/)).toHaveLength(1);
    expect(document.querySelectorAll("mark").length).toBeGreaterThan(0);
  });

  it("marks where identifiers sit on the page", () => {
    open(sampleAudit(), "employee-record.pdf");
    const page = screen.getByRole("figure", { name: "Page 1" });
    expect(within(page).getAllByLabelText(/Person name/).length).toBeGreaterThan(0);
  });

  it("switches a pane to OCR", async () => {
    open(sampleAudit(), "terms-and-conditions.pdf");
    await userEvent.click(screen.getByRole("combobox", { name: "Right reading" }));
    await userEvent.click(await screen.findByRole("option", { name: "OCR" }));
    expect(screen.getByRole("combobox", { name: "Right reading" })).toHaveTextContent("OCR");
  });

  it("says how to get a page picture when the report has none", () => {
    open(sampleReport(), "terms-and-conditions.pdf");
    expect(screen.getByText("No picture of this page")).toBeInTheDocument();
    expect(screen.getByText("--page-images --detail full")).toBeInTheDocument();
  });

  it("names a scanned page's reading OCR", () => {
    open(sampleAudit(), "invoice-scan.pdf");
    expect(screen.getByRole("combobox", { name: "Left reading" })).toHaveTextContent("OCR");
  });
});
