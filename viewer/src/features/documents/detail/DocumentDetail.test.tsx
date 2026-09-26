import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IgnoreProvider } from "@/components/IgnoreProvider";
import { renderPage } from "@/test/render";
import { required, sampleAudit, sampleReport } from "@/test/sample";
import type { FindingRef } from "@/report/route";
import type { Report } from "@/report/types";
import { DocumentDetail } from "./DocumentDetail";

function open(report: Report, name: string, where: { page?: number; finding?: FindingRef } = {}) {
  const index = report.documents.findIndex((d) => d.relative_path.endsWith(name));
  const document = report.documents[index];
  if (!document) throw new Error(`no ${name} in the sample`);
  renderPage(
    <IgnoreProvider report={report}>
      <DocumentDetail
        report={report}
        document={document}
        index={index}
        page={where.page ?? null}
        finding={where.finding ?? null}
      />
    </IgnoreProvider>,
  );
  return document;
}

const side = () => screen.getByRole("complementary", { name: "Page" });
const checklist = () => within(side()).getByRole("region", { name: "Found on this page" });

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

/** The sample, with the fingerprints a schema 17 report gives each finding. */
function fingerprinted(): Report {
  const report = sampleAudit();
  let n = 0;
  for (const document of report.documents)
    for (const match of document.sensitive.matches) match.fingerprint = `id-${String(n++).padStart(16, "0")}`;
  return report;
}

describe("DocumentDetail", () => {
  it("diffs a document read more than one way, with what the page and the document cost", async () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    expect(screen.getByRole("heading", { name: "master-services-agreement.pdf" })).toBeInTheDocument();
    const totals = screen.getByRole("group", { name: "Cost and time" });
    expect(totals).toHaveTextContent(/This page\s*\$\d/);
    expect(totals).toHaveTextContent(/Document\s*\$\d/);
    expect(screen.getByRole("navigation", { name: "pagination" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Base reader" })).toHaveTextContent("pdfplumber");
    expect(screen.getByRole("combobox", { name: "Compare reader" })).toHaveTextContent("pypdf");
    expect(await screen.findByLabelText("Lines changed", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("shows a document read one way as its page, with what was found marked", () => {
    open(sampleAudit(), "supplier-invoices-scanned.pdf");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const reading = screen.getByTestId("page-reading");
    expect(reading.querySelectorAll("mark").length).toBeGreaterThan(0);
  });

  it("moves through the pages of a document read one way", async () => {
    open(sampleAudit(), "supplier-invoices-scanned.pdf");
    const first = screen.getByTestId("page-reading").textContent;
    await userEvent.click(screen.getByRole("link", { name: "Go to next page" }));
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("page-reading").textContent).not.toBe(first);
  });

  it("shows the page's picture when the report has one, and leaves it out otherwise", () => {
    open(sampleAudit(), "master-services-agreement.pdf", { page: 3 });
    expect(within(side()).getByRole("figure", { name: "Page 3" })).toBeInTheDocument();
  });

  it("leaves the picture out of a report without pictures", () => {
    open(sampleReport(), "master-services-agreement.pdf");
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
  });

  it("crosses out a finding ticked off, and stops marking it in the text", async () => {
    open(fingerprinted(), "supplier-invoices-scanned.pdf");
    const marks = () => screen.getByTestId("page-reading").querySelectorAll("mark").length;
    const before = marks();
    const [box] = within(checklist()).getAllByRole("checkbox");
    await userEvent.click(required(box));
    expect(required(box)).toBeChecked();
    expect(within(checklist()).getAllByRole("listitem")[0]?.querySelector("label")?.className).toContain("line-through");
    expect(marks()).toBeLessThan(before);
    expect(within(checklist()).getByText(/Kept while this page is open/)).toBeInTheDocument();
  });

  it("opens on a finding a link named, and marks it out", () => {
    const report = sampleAudit();
    const entry = required(report.documents.find((d) => d.relative_path === "master-services-agreement.pdf"));
    const index = entry.sensitive.matches.findIndex((m) => m.category === "iban");
    const match = required(entry.sensitive.matches[index]);
    open(report, "master-services-agreement.pdf", { finding: { kind: "identifier", index } });
    expect(screen.getByRole("link", { name: String(match.page) })).toHaveAttribute("aria-current", "page");
    const item = within(checklist())
      .getAllByRole("listitem")
      .find((li) => li.className.includes("ring"));
    expect(item).toHaveTextContent(match.label);
  });

  it("cannot show values a report does not hold", () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    expect(screen.getByRole("button", { name: "Show the values" })).toBeDisabled();
  });

  it("opens a revealing report masked, and shows the values on request", async () => {
    open(revealed(), "supplier-invoices-scanned.pdf");
    expect(screen.getByTestId("page-reading")).not.toHaveTextContent("REVEALED-VALUE");
    await userEvent.click(screen.getByRole("button", { name: "Show the values" }));
    expect(screen.getByTestId("page-reading")).toHaveTextContent("REVEALED-VALUE");
  });

  it("marks the finding a link opened in the diff's own text", async () => {
    // jsdom has no CSS highlights; a stand-in records what would be marked.
    const registry = new Map<string, { ranges: Range[] }>();
    vi.stubGlobal("CSS", { highlights: registry });
    vi.stubGlobal(
      "Highlight",
      class {
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      },
    );
    const report = sampleAudit();
    const entry = required(report.documents.find((d) => d.relative_path === "master-services-agreement.pdf"));
    const index = entry.sensitive.matches.findIndex((m) => m.category === "iban");
    const match = required(entry.sensitive.matches[index]);
    open(report, "master-services-agreement.pdf", { finding: { kind: "identifier", index } });
    await vi.waitFor(() => expect(registry.get("complydoc-finding")?.ranges.length).toBeGreaterThan(0), {
      timeout: 5000,
    });
    const marked = required(registry.get("complydoc-finding")?.ranges[0]).toString();
    expect(marked.replace(/\s+/g, "")).toBe(match.masked.replace(/\s+/g, ""));
    // Unmounted first, so the diff takes its mark away while the stand-in is still there.
    cleanup();
    vi.unstubAllGlobals();
  });
});
