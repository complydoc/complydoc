import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { sampleRunOf } from "@/test/sample";
import type { ChunkRun, Report } from "@/report/types";
import { ChunksPage } from "./ChunksPage";

function splitter(chunker: string, flagged: boolean): ChunkRun {
  return {
    chunker,
    chunks: [
      {
        index: 0,
        document: "/work/contracts/msa.pdf",
        page: 1,
        characters: 400,
        tokens: 90,
        identifiers: ["IBAN: •••• 4432"],
        hidden: 0,
        flags: flagged ? ["split_sentence"] : [],
        metadata_keys: ["source", "page"],
        preview: "The supplier shall notify the customer",
      },
    ],
    stats: { count: 1, tokens_total: 90, tokens_min: 90, tokens_median: 90, tokens_p95: 90, tokens_max: 90 },
    token_encoding: "o200k_base",
    token_fidelity: "approximate",
    flag_counts: { split_sentence: flagged ? 1 : 0 },
    repeated_identifiers: {},
    facts: [{ fact: "Payment is due within thirty days", status: flagged ? "split" : "whole", chunks: [0] }],
    retrieval: [],
    top_k: 5,
  };
}

function chunksRun(...runs: ChunkRun[]): Report {
  return { ...sampleRunOf([]), documents: [], chunks: runs };
}

describe("ChunksPage", () => {
  it("says a run that split nothing did not, and how to for this folder", () => {
    renderPage(<ChunksPage report={sampleRunOf(["cost", "readiness", "sensitive"])} />);
    expect(screen.getByText("No chunks in this run")).toBeInTheDocument();
    expect(screen.getByText(/^complydoc chunks .* -s langchain_text_splitters:RecursiveCharacterTextSplitter$/)).toBeInTheDocument();
  });

  it("says what the page is for, and shows a splitter's sizes, its cuts in words and the documents it cut worst", () => {
    renderPage(<ChunksPage report={chunksRun(splitter("recursive chunk_size=400", true))} />);
    expect(screen.getByText(/a text splitter cuts them into chunks/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Splitters compared" });
    expect(table).toHaveTextContent("chunk_size 400");
    expect(table).toHaveTextContent("100%");
    const detail = screen.getByRole("group", { name: "recursive chunk_size=400" });
    expect(detail).toHaveTextContent("Cut mid-sentence1");
    expect(detail).toHaveTextContent("stops halfway through a sentence");
    const documents = screen.getByRole("list", { name: "Documents, the worst cut first" });
    expect(within(documents).getByText("msa.pdf")).toBeInTheDocument();
    expect(documents).toHaveTextContent("1 of 1 chunk cut badly");
  });

  it("compares the splitters, opens on the one that cuts least badly, and shows another when picked", async () => {
    renderPage(<ChunksPage report={chunksRun(splitter("recursive", true), splitter("character", false))} />);
    const table = screen.getByRole("table", { name: "Splitters compared" });
    const [, recursive, character] = within(table).getAllByRole("row");
    expect(character).toHaveTextContent("Cuts least badly");
    expect(recursive).not.toHaveTextContent("Cuts least badly");
    expect(screen.getByRole("group", { name: "character" })).toBeInTheDocument();
    const checks = screen.getByRole("table", { name: "Checks" });
    const [, fact] = within(checks).getAllByRole("row");
    expect(fact).toHaveTextContent("split");
    expect(fact).toHaveTextContent("whole");
    await userEvent.click(screen.getByRole("button", { name: "recursive" }));
    expect(screen.getByRole("group", { name: "recursive" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Documents, the worst cut first" })).toHaveTextContent("1 of 1 chunk");
  });

  it("leaves out the flags no chunk carries", () => {
    renderPage(<ChunksPage report={chunksRun(splitter("character", false))} />);
    expect(screen.queryByText("cut mid-sentence")).not.toBeInTheDocument();
  });
});
