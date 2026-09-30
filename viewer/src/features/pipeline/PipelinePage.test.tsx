import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { renderPage } from "@/test/render";
import { required, sampleAudit } from "@/test/sample";
import { nestedReport } from "@/test/trace";
import { PipelinePage } from "./PipelinePage";

describe("PipelinePage", () => {
  beforeEach(() => window.history.replaceState(null, "", "#pipeline?trace=open"));

  it("heads the run with what it took, cost, and what it sent where", () => {
    renderPage(<PipelinePage report={nestedReport()} />);
    const header = screen.getByRole("group", { name: "The run" });
    expect(header).toHaveTextContent("Tokens embedded1,200");
    expect(header).toHaveTextContent("Sent toapi.example.com");
    expect(header).toHaveTextContent("Identifiers sent1");
  });

  it("lists every call, a directory loader's files beneath it, each with its time", async () => {
    renderPage(<PipelinePage report={nestedReport()} />);
    const tree = screen.getByRole("tree", { name: "Calls" });
    const rows = within(tree).getAllByRole("treeitem");
    expect(rows.map((row) => [row.getAttribute("aria-level"), row.textContent])).toEqual([
      ["1", expect.any(String)],
      ["2", expect.stringContaining("DirectoryLoadercontracts")],
      ["3", expect.stringContaining("a.pdfPyPDFLoader")],
      ["3", expect.stringContaining("b.pdfPyPDFLoader")],
      ["2", expect.stringContaining("RecursiveCharacterTextSplitter")],
      ["2", expect.stringContaining("OpenAIEmbeddings")],
    ]);
    // Folding the directory loader hides its files; folding the run, everything under it.
    await userEvent.click(within(required(rows[1])).getByRole("button", { name: "Fold" }));
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(4);
    await userEvent.click(within(required(rows[0])).getByRole("button", { name: "Fold" }));
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(1);
  });

  it("collapses every call and expands them again from one control", async () => {
    renderPage(<PipelinePage report={nestedReport()} />);
    const tree = screen.getByRole("tree", { name: "Calls" });
    await userEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(6);
  });

  it("folds a call's input away, and brings it back", async () => {
    renderPage(<PipelinePage report={nestedReport()} />);
    const input = screen.getByRole("region", { name: "Input" });
    const fold = within(input).getByRole("button", { expanded: true });
    await userEvent.click(fold);
    expect(within(input).getByText("Payments go to account •••• 4432")).not.toBeVisible();
    await userEvent.click(within(input).getByRole("button", { expanded: false }));
    expect(within(input).getByText("Payments go to account •••• 4432")).toBeVisible();
  });

  it("opens on the call that sent text away, with what it sent", () => {
    renderPage(<PipelinePage report={nestedReport()} />);
    const tree = screen.getByRole("tree", { name: "Calls" });
    expect(within(tree).getByRole("treeitem", { selected: true })).toHaveTextContent("OpenAIEmbeddings");
    expect(screen.getByRole("tab", { name: "Run" })).toHaveAttribute("aria-selected", "true");
    // An embedding call's input is the text it sent; its output, the vectors.
    expect(
      within(screen.getByRole("region", { name: "Input" })).getByText("Payments go to account •••• 4432"),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Output" })).toHaveTextContent("vectors: 9");
  });

  it("gives a call's figures, and what changed against the step before, in its metadata", async () => {
    renderPage(<PipelinePage report={nestedReport()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Metadata" }));
    const figures = screen.getByRole("group", { name: "Figures" });
    expect(figures).toHaveTextContent("Cost$0.0000");
    expect(figures).toHaveTextContent("Tokens in1,200");
  });

  it("moves through the calls from the keyboard, and shows the one picked", async () => {
    renderPage(<PipelinePage report={nestedReport()} />);
    const tree = screen.getByRole("tree", { name: "Calls" });
    tree.focus();
    await userEvent.keyboard("k");
    expect(within(tree).getByRole("treeitem", { selected: true })).toHaveTextContent("RecursiveCharacterTextSplitter");
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByText("chunk_size: 400")).toBeInTheDocument();
  });

  it("follows each identifier through the steps in its own view", async () => {
    renderPage(<PipelinePage report={nestedReport()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Identifiers" }));
    expect(screen.getByRole("table", { name: "Where each identifier went" })).toBeInTheDocument();
  });

  it("reads an audit as a trace of its documents, from the times it recorded", () => {
    const report = sampleAudit();
    renderPage(<PipelinePage report={report} />);
    expect(screen.getByRole("group", { name: "The run" })).toHaveTextContent(`${report.documents.length} documents`);
    expect(screen.getByRole("tree", { name: "Calls" })).toBeInTheDocument();
  });

  it("says a run with nothing to trace has none, and how to record one", () => {
    renderPage(<PipelinePage report={{ ...sampleAudit(), documents: [] }} />);
    expect(screen.getByText("No pipeline in this run")).toBeInTheDocument();
  });
  it("lists the pipeline's runs, and opens one's trace beside them", async () => {
    window.history.replaceState(null, "", "#pipeline");
    const report = nestedReport();
    const older = { ...report, run: { ...report.run, started_at: "2026-09-29T10:00:00" } };
    const open = vi.fn();
    renderPage(
      <FolderRunsContext.Provider
        value={{
          runs: [
            { id: "new", name: "new.json", report },
            { id: "old", name: "old.json", report: older },
            { id: "audit", name: "audit.json", report: sampleAudit() },
          ],
          current: "new",
          open,
        }}
      >
        <PipelinePage report={report} />
      </FolderRunsContext.Provider>,
    );
    const table = screen.getByRole("table", { name: "Runs" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(screen.queryByRole("complementary", { name: "Trace" })).not.toBeInTheDocument();
    await userEvent.click(required(within(required(rows[0])).getAllByRole("cell")[1]));
    const panel = screen.getByRole("complementary", { name: "Trace" });
    expect(panel).toHaveTextContent("Run 1 of 2");
    expect(within(panel).getByRole("tree", { name: "Calls" })).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Older run" }));
    expect(open).toHaveBeenCalledWith("old");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "Trace" })).not.toBeInTheDocument();
  });
  it("says which identifiers the run could not look for, and that they are shown unmasked", () => {
    const report = nestedReport();
    const trace = { ...required(report.trace), unscanned: { "Person name": "names need the ner extra" } };
    renderPage(<PipelinePage report={{ ...report, trace }} />);
    expect(screen.getByText(/Person name not looked for/)).toHaveTextContent("neither counted nor masked");
    expect(screen.getByText("Names need the ner extra")).toBeInTheDocument();
  });

});
