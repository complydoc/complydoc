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

  it("shows one splitter's sizes, flags, facts and chunks", () => {
    renderPage(<ChunksPage report={chunksRun(splitter("recursive", true))} />);
    expect(screen.queryByRole("region", { name: "Splitters" })).not.toBeInTheDocument();
    const facts = screen.getByRole("region", { name: "Expected facts" });
    expect(within(facts).getByText("split")).toBeInTheDocument();
    const chunks = screen.getByRole("table", { name: "Chunks" });
    expect(within(chunks).getByText("msa.pdf")).toBeInTheDocument();
    expect(within(chunks).getByText("split_sentence")).toBeInTheDocument();
  });

  it("compares several splitters, and opens each", async () => {
    renderPage(<ChunksPage report={chunksRun(splitter("recursive", true), splitter("character", false))} />);
    const table = screen.getByRole("table", { name: "Splitters" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);

    await userEvent.click(screen.getByRole("radio", { name: "character" }));
    expect(within(screen.getByRole("region", { name: "Expected facts" })).getByText("whole")).toBeInTheDocument();
  });
});
