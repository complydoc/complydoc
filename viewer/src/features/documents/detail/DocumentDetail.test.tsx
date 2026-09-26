import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IgnoreProvider } from "@/components/IgnoreProvider";
import { IgnoreContext, type IgnoreState } from "@/hooks/useIgnores";
import { documentFindings } from "@/report/pageFindings";
import { renderPage } from "@/test/render";
import { required, sampleAudit, sampleReport, sampleVerified } from "@/test/sample";
import type { FindingRef } from "@/report/route";
import type { Report } from "@/report/types";
import { DocumentDetail } from "./DocumentDetail";
import { FindingPopover } from "./FindingPopover";

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

/** jsdom has no CSS highlights; a stand-in records what each would mark. */
function recordHighlights(): Map<string, { ranges: Range[] }> {
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
  return registry;
}

/** Unmounted first, so the view takes its marks away while the stand-in is still there. */
function stopRecording() {
  cleanup();
  vi.unstubAllGlobals();
}

const marked = (registry: Map<string, { ranges: Range[] }>, name: string) =>
  (registry.get(`complydoc-${name}`)?.ranges ?? []).map((r) => r.toString());

describe("DocumentDetail", () => {
  it("diffs a document read more than one way, with what the document costs beside its name", async () => {
    open(sampleAudit(), "master-services-agreement.pdf");
    expect(screen.getByRole("heading", { name: "master-services-agreement.pdf" })).toBeInTheDocument();
    expect(screen.getByTitle("The whole document, under the plan chosen above")).toHaveTextContent(/^\$\d/);
    // The pages sit at the end of the readers' row, right above the diff.
    expect(screen.getByRole("group", { name: "Pages" })).toHaveTextContent("Page 1 of 8");
    expect(screen.getByRole("combobox", { name: "Base reader" })).toHaveTextContent("pdfplumber");
    expect(screen.getByRole("combobox", { name: "Compare reader" })).toHaveTextContent("pypdf");
    expect(await screen.findByLabelText("Lines changed", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("shows a document read one way as its page, with the page's cost on its first line", () => {
    open(sampleAudit(), "supplier-invoices-scanned.pdf");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByTestId("page-reading")).toHaveTextContent(/# Page 1 · \$\d/);
  });

  it("moves through the pages of a document read one way", async () => {
    open(sampleAudit(), "supplier-invoices-scanned.pdf");
    const first = screen.getByTestId("page-reading").textContent;
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("group", { name: "Pages" })).toHaveTextContent(/Page 2 of/);
    expect(screen.getByTestId("page-reading").textContent).not.toBe(first);
  });

  it("marks what was found in the text itself, by severity", async () => {
    const registry = recordHighlights();
    const document = open(sampleAudit(), "supplier-invoices-scanned.pdf");
    const onPage = document.sensitive.matches.filter((m) => m.page === 1);
    await vi.waitFor(() =>
      expect(["high", "medium", "low"].flatMap((tone) => marked(registry, tone)).length).toBeGreaterThan(0),
    );
    for (const value of marked(registry, "high"))
      expect(
        onPage.some((m) => m.severity === "high" && m.masked.replace(/\s/g, "") === value.replace(/\s/g, "")),
      ).toBe(true);
    stopRecording();
  });

  it("opens a finding's card when the pointer rests on it, and closes it when it leaves", async () => {
    const registry = recordHighlights();
    open(fingerprinted(), "supplier-invoices-scanned.pdf");
    await vi.waitFor(() =>
      expect(marked(registry, "high").length + marked(registry, "medium").length).toBeGreaterThan(0),
    );
    const range = required(
      [...(registry.get("complydoc-high")?.ranges ?? []), ...(registry.get("complydoc-medium")?.ranges ?? [])][0],
    );
    // jsdom lays nothing out: the caret and the text's box are given.
    Range.prototype.getClientRects = () => [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList;
    Object.assign(document, {
      caretPositionFromPoint: () => ({ offsetNode: range.startContainer, offset: range.startOffset }),
    });
    const text = screen.getByTestId("page-reading");
    text.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 10, clientY: 10 }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toHaveTextContent(/Not a problem: ignore it/);
    text.dispatchEvent(new MouseEvent("mouseleave"));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    Reflect.deleteProperty(document, "caretPositionFromPoint");
    Reflect.deleteProperty(Range.prototype, "getClientRects");
    stopRecording();
  });

  it("puts a tick on the rail for each finding, which goes to it", async () => {
    const registry = recordHighlights();
    open(sampleAudit(), "supplier-invoices-scanned.pdf");
    const rail = await screen.findByRole("group", { name: "Where the findings are" });
    const [tick] = within(rail).getAllByRole("button");
    expect(marked(registry, "active")).toHaveLength(0);
    await userEvent.click(required(tick));
    // The finding it names is drawn out from the rest.
    await vi.waitFor(() => expect(marked(registry, "active").length).toBeGreaterThan(0));
    stopRecording();
  });

  it("opens on a finding a link named, marked out from the rest, on its page", async () => {
    const registry = recordHighlights();
    const report = sampleAudit();
    const entry = required(report.documents.find((d) => d.relative_path === "master-services-agreement.pdf"));
    const index = entry.sensitive.matches.findIndex((m) => m.category === "iban");
    const match = required(entry.sensitive.matches[index]);
    open(report, "master-services-agreement.pdf", { finding: { kind: "identifier", index } });
    expect(screen.getByRole("group", { name: "Pages" })).toHaveTextContent(`Page ${match.page} of`);
    await vi.waitFor(() => expect(marked(registry, "active").length).toBeGreaterThan(0), { timeout: 5000 });
    expect(required(marked(registry, "active")[0]).replace(/\s+/g, "")).toBe(match.masked.replace(/\s+/g, ""));
    stopRecording();
  });

  it("shows the page's picture beside the text, and puts it away to give the text the width", async () => {
    open(sampleAudit(), "master-services-agreement.pdf", { page: 3 });
    expect(within(side()).getByRole("figure", { name: "Page 3" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide the page" }));
    expect(screen.queryByRole("complementary", { name: "Page" })).not.toBeInTheDocument();
    expect(localStorage.getItem("complydoc.page-collapsed")).toBe("1");
    await userEvent.click(screen.getByRole("button", { name: "Show the page" }));
    expect(within(side()).getByRole("figure", { name: "Page 3" })).toBeInTheDocument();
  });

  it("has no column beside the text when there is no picture and no vision check", () => {
    open(sampleReport(), "master-services-agreement.pdf");
    expect(screen.queryByRole("complementary", { name: "Page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide the page" })).not.toBeInTheDocument();
  });

  it("says beside the page what a vision check made of it", () => {
    const report = sampleVerified();
    open(report, required(report.documents[0]).relative_path);
    expect(within(side()).getByRole("note")).toBeInTheDocument();
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
});

describe("FindingPopover", () => {
  function state(overrides: Partial<IgnoreState> = {}): IgnoreState {
    return {
      editable: false,
      file: null,
      entries: [],
      error: null,
      ignore: vi.fn(async () => true),
      unignore: vi.fn(async () => true),
      ...overrides,
    };
  }

  it("says what a clicked finding is, and ignores it when ticked", async () => {
    const report = fingerprinted();
    const document = required(report.documents.find((d) => d.relative_path === "master-services-agreement.pdf"));
    const finding = required(documentFindings(document, false).find((f) => f.kind === "identifier"));
    const ignores = state();
    render(
      <IgnoreContext.Provider value={ignores}>
        <FindingPopover finding={finding} rect={new DOMRect(10, 10, 40, 16)} onClose={() => {}} />
      </IgnoreContext.Provider>,
    );
    const card = await screen.findByRole("dialog");
    expect(card).toHaveTextContent(finding.label);
    expect(card).toHaveTextContent(finding.severity);
    await userEvent.click(within(card).getByRole("checkbox"));
    expect(ignores.ignore).toHaveBeenCalledWith(expect.objectContaining({ finding: finding.fingerprint }));
    expect(card).toHaveTextContent(/Kept while this page is open/);
  });
});
