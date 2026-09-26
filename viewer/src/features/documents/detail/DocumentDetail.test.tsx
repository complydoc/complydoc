import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { required, sampleAudit, sampleReport } from "@/test/sample";
import { wide } from "@/test/setup";
import type { FindingRef } from "@/report/route";
import type { Report } from "@/report/types";
import { DocumentDetail } from "./DocumentDetail";

function open(report: Report, name: string, where: { page?: number; finding?: FindingRef } = {}) {
  const index = report.documents.findIndex((d) => d.relative_path.endsWith(name));
  const document = report.documents[index];
  if (!document) throw new Error(`no ${name} in the sample`);
  renderPage(
    <DocumentDetail
      report={report}
      document={document}
      index={index}
      page={where.page ?? null}
      finding={where.finding ?? null}
    />,
  );
  return document;
}

const page = () => screen.getByRole("complementary", { name: "Page" });

/** The sample, as a run with --reveal writes it: the values in `text`, a masked copy beside them. */
function revealed(): Report {
  const report = sampleAudit();
  for (const document of report.documents)
    for (const text of document.extracted_text) {
      text.masked_text = text.text;
      text.masked_ocr_text = text.ocr_text;
      text.masked_readings = { ...text.readings };
      text.text = `${text.text} REVEALED-VALUE`;
    }
  report.run.reveal_used = true;
  return report;
}

describe("DocumentDetail", () => {
  beforeEach(() => wide());

  it("names the document with what all of it costs, and has one view, the diff", async () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    expect(screen.getByRole("heading", { name: "master-services-agreement.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Cost and time" })).toHaveTextContent(/Document\s*\$\d/);
    expect(screen.queryByRole("radio", { name: "Pages" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Base reader" })).toHaveTextContent("pdfplumber");
    expect(screen.getByRole("combobox", { name: "Compare reader" })).toHaveTextContent("pypdf");
    expect(await screen.findByLabelText("Lines changed", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("puts the page beside the text: its picture, its cost and what was found on it", () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    expect(within(page()).getByRole("figure", { name: "Page 1" })).toBeInTheDocument();
    expect(within(page()).getByText("This page").nextElementSibling).toHaveTextContent(/^\$\d/);
    const found = within(page()).getByRole("region", { name: "On this page" });
    expect(within(found).getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("opens on the page asked for", () => {
    open(sampleAudit(), "master-services-agreement.pdf", { page: 3 });
    expect(within(page()).getByRole("figure", { name: "Page 3" })).toBeInTheDocument();
  });

  it("leaves the picture out when there is nothing to draw", () => {
    open(sampleReport(), "master-services-agreement.pdf");
    expect(within(page()).queryByRole("figure")).not.toBeInTheDocument();
    expect(within(page()).getByRole("region", { name: "On this page" })).toBeInTheDocument();
  });

  it("shows a document read one way as its text, with nothing to compare", async () => {
    open(sampleAudit(), "supplier-invoices-scanned.pdf");
    expect(screen.queryByRole("combobox", { name: "Compare reader" })).not.toBeInTheDocument();
    expect(await screen.findByText("One reading", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Text" })).toHaveTextContent("# Page 1");
  });

  it("puts each finding under its line, and marks out the one a link opened", async () => {
    const report = sampleAudit();
    const entry = required(report.documents.find((d) => d.relative_path === "master-services-agreement.pdf"));
    const index = entry.sensitive.matches.findIndex((m) => m.category === "iban");
    const match = required(entry.sensitive.matches[index]);
    open(report, "master-services-agreement.pdf", { finding: { kind: "identifier", index } });

    expect(screen.getByRole("alert")).toHaveTextContent(match.label);
    expect(within(page()).getByRole("figure", { name: `Page ${match.page}` })).toBeInTheDocument();
    await vi.waitFor(() => expect(document.querySelector(`[data-finding="identifier-${index}"]`)).toBeTruthy(), {
      timeout: 5000,
    });
    expect(document.querySelector(`[data-finding="identifier-${index}"]`)?.className).toContain("ring");
  });

  it("points at a hidden instruction's passage", async () => {
    open(sampleAudit(), "vendor-due-diligence.pdf", { finding: { kind: "hidden", index: 0 } });
    expect(screen.getByRole("alert")).toHaveTextContent("Hidden instruction");
    await vi.waitFor(() => expect(document.querySelector('[data-finding="hidden-0"]')).toBeTruthy(), {
      timeout: 5000,
    });
  });

  it("scrolls the text to a finding picked beside it", async () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    const scroller = await screen.findByTestId("diff-scroller", {}, { timeout: 5000 });
    const scrolled = vi.spyOn(scroller, "scrollTo");
    const found = within(page()).getByRole("region", { name: "On this page" });
    await userEvent.click(required(within(found).getAllByRole("button")[0]));
    await vi.waitFor(() => expect(scrolled).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("cannot show values a report does not hold", () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    expect(screen.getByRole("button", { name: "Show the values" })).toBeDisabled();
  });

  it("opens a revealing report masked, and shows the values on request", async () => {
    open(revealed(), "supplier-invoices-scanned.pdf");
    const text = await screen.findByRole("list", { name: "Text" }, { timeout: 5000 });
    expect(text).not.toHaveTextContent("REVEALED-VALUE");
    await userEvent.click(screen.getByRole("button", { name: "Show the values" }));
    expect(screen.getByRole("list", { name: "Text" })).toHaveTextContent("REVEALED-VALUE");
    expect(screen.getByText("Values visible")).toBeInTheDocument();
  });
});
