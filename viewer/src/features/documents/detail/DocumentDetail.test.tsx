import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { required, sampleAudit, sampleReport } from "@/test/sample";
import type { FindingRef } from "@/report/route";
import type { Report } from "@/report/types";
import { DocumentDetail } from "./DocumentDetail";

function open(report: Report, name: string, where: { page?: number; finding?: FindingRef } = {}) {
  const index = report.documents.findIndex((d) => d.relative_path.endsWith(name));
  const document = report.documents[index];
  if (!document) throw new Error(`no ${name} in the sample`);
  render(
    <TooltipProvider>
      <DocumentDetail report={report} document={document} index={index} page={where.page ?? null} finding={where.finding ?? null} />
    </TooltipProvider>,
  );
  return document;
}

describe("DocumentDetail", () => {
  it("names the document and how far its readers agree", () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    expect(screen.getByRole("heading", { name: "master-services-agreement.pdf" })).toBeInTheDocument();
    expect(screen.getByText(/pypdf 34%/)).toHaveTextContent("reordered");
  });

  it("shows the page beside two readings, the kept one against the next reader", () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    expect(screen.getByRole("figure", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Left reading" })).toHaveTextContent("pdfplumber");
    expect(screen.getByRole("combobox", { name: "Right reading" })).toHaveTextContent("pypdf");
    expect(screen.getAllByText(/\d+ differences$/)).toHaveLength(1);
    expect(document.querySelectorAll("mark").length).toBeGreaterThan(0);
  });

  it("marks where identifiers sit on the page", () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    const page = screen.getByRole("figure", { name: "Page 1" });
    expect(within(page).getAllByLabelText(/Person name/).length).toBeGreaterThan(0);
  });

  it("switches a pane to OCR", async () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    await userEvent.click(screen.getByRole("combobox", { name: "Right reading" }));
    await userEvent.click(await screen.findByRole("option", { name: "OCR" }));
    expect(screen.getByRole("combobox", { name: "Right reading" })).toHaveTextContent("OCR");
  });

  it("says how to get a page picture when the report has none", () => {
    open(sampleReport(), "master-services-agreement.pdf");
    expect(screen.getByText("No picture of this page")).toBeInTheDocument();
    expect(screen.getByText("--page-images --detail full")).toBeInTheDocument();
  });

  it("gives a page read only one way the page and that reading, in two halves", () => {
    open(sampleAudit(), "supplier-invoices-scanned.pdf");
    // A scanned page's only reading is OCR's, so there is nothing to pick and nothing to compare.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("OCR", { selector: "[data-slot=card-title]" })).toBeInTheDocument();
    expect(screen.queryByText("Marked: what the other reading lacks")).not.toBeInTheDocument();
    expect(document.querySelectorAll("mark:not([data-finding])")).toHaveLength(0);
  });

  it("opens on the page asked for", () => {
    open(sampleAudit(), "master-services-agreement.pdf", { page: 3 });
    expect(screen.getByRole("figure", { name: "Page 3" })).toBeInTheDocument();
  });

  it("shows an identifier where it sits: its page, its box and its text", () => {
    const report = sampleAudit();
    const entry = required(report.documents.find((d) => d.relative_path === "master-services-agreement.pdf"));
    const index = entry.sensitive.matches.findIndex((m) => m.category === "iban");
    const match = required(entry.sensitive.matches[index]);
    open(report, "master-services-agreement.pdf", { finding: { kind: "identifier", index } });

    expect(screen.getByRole("figure", { name: `Page ${match.page}` })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(match.label);
    expect(document.body.querySelector("[data-finding]")).toBeTruthy();
    const marked = [...document.body.querySelectorAll("mark[data-finding]")].map((m) => m.textContent).join("");
    expect(marked).toContain(match.masked.split(" ").at(-1));
  });

  it("points at a hidden instruction's passage", () => {
    open(sampleAudit(), "vendor-due-diligence.pdf", { finding: { kind: "hidden", index: 0 } });
    expect(screen.getByRole("alert")).toHaveTextContent("Hidden instruction");
    expect(document.body.querySelectorAll("mark[data-finding]").length).toBeGreaterThan(0);
  });
});
