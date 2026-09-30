import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { required, sampleAudit } from "@/test/sample";
import { nestedReport } from "@/test/trace";
import { PipelinePage } from "./PipelinePage";

describe("PipelinePage", () => {
  beforeEach(() => window.history.replaceState(null, "", "#pipeline"));

  it("heads the run with what it took, cost, and what it sent where", () => {
    renderPage(<PipelinePage report={nestedReport()} />);
    const header = screen.getByRole("banner", { name: "The run" });
    expect(header).toHaveTextContent("Tokens embedded1,200");
    expect(header).toHaveTextContent("Sent toapi.example.com");
    expect(header).toHaveTextContent("Identifiers sent1");
  });

  it("lists every call, a directory loader's files beneath it, each with its time", async () => {
    renderPage(<PipelinePage report={nestedReport()} />);
    const tree = screen.getByRole("tree", { name: "Calls" });
    const rows = within(tree).getAllByRole("treeitem");
    expect(rows.map((row) => [row.getAttribute("aria-level"), row.textContent])).toEqual([
      ["1", expect.stringContaining("DirectoryLoadercontracts")],
      ["2", expect.stringContaining("a.pdfPyPDFLoader")],
      ["2", expect.stringContaining("b.pdfPyPDFLoader")],
      ["1", expect.stringContaining("RecursiveCharacterTextSplitter")],
      ["1", expect.stringContaining("OpenAIEmbeddings")],
    ]);
    // Folding the directory loader hides its files.
    await userEvent.click(within(required(rows[0])).getByRole("button", { name: "Fold" }));
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(3);
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
    expect(screen.getByRole("banner", { name: "The run" })).toHaveTextContent(`${report.documents.length} documents`);
    expect(screen.getByRole("tree", { name: "Calls" })).toBeInTheDocument();
  });

  it("says a run with nothing to trace has none, and how to record one", () => {
    renderPage(<PipelinePage report={{ ...sampleAudit(), documents: [] }} />);
    expect(screen.getByText("No pipeline in this run")).toBeInTheDocument();
  });
});
