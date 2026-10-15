import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvalsProvider } from "@/components/EvalsProvider";
import { renderPage } from "@/test/render";
import { sampleAudit } from "@/test/sample";
import type { EvalSummary, Report } from "@/report/types";
import { EvalsPage } from "./EvalsPage";

const EVALS: EvalSummary = {
  file: "/work/contracts/.complydoc-evals.yaml",
  readers: ["whole", "drops"],
  checks: [
    { fact: "Invoices are payable within fourteen days", found: { whole: "exact", drops: "exact" }, scores: {} },
    {
      fact: "Title passes on receipt of payment",
      found: { whole: "exact", drops: null },
      scores: {},
      nearest: { drops: "Title passes full and not before" },
    },
  ],
};

function withEvals(evals: EvalSummary | null): Report {
  return { ...sampleAudit(), evals };
}

afterEach(() => vi.unstubAllGlobals());

describe("EvalsPage", () => {
  it("scores each reading and shows what a miss was read as", () => {
    renderPage(<EvalsPage report={withEvals(EVALS)} />);

    const board = within(screen.getByRole("region", { name: "Scoreboard" }));
    const [, best, worse] = board.getAllByRole("row");
    expect(best).toHaveTextContent("whole");
    expect(best).toHaveTextContent("2 of 2");
    expect(worse).toHaveTextContent("drops");
    expect(worse).toHaveTextContent("1 of 2");

    const facts = within(screen.getByRole("region", { name: "Expected facts" }));
    expect(facts.getByText("Title passes on receipt of payment")).toBeInTheDocument();
    expect(facts.getByText("Title passes full and not before")).toBeInTheDocument();
    // Opened as a file, nothing can be added.
    expect(screen.queryByRole("button", { name: "Expect it" })).not.toBeInTheDocument();
  });

  it("says what the page is for when the run has no evals and none can be added", () => {
    renderPage(<EvalsPage report={withEvals(null)} />);
    expect(screen.getByText("No evals in this run")).toBeInTheDocument();
  });

  it("adds a passage through complydoc ui and runs it against the run's text at once", async () => {
    const file = "/work/contracts/.complydoc-evals.yaml";
    const listing = { file, facts: [] as { text: string }[] };
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") listing.facts = [JSON.parse(String(init.body)) as { text: string }];
      if (url.endsWith("/score")) {
        const checks = listing.facts.map((fact) => ({ fact: fact.text, found: { pdfplumber: "exact" }, scores: {} }));
        return new Response(JSON.stringify({ file, readers: ["pdfplumber"], checks }));
      }
      return new Response(JSON.stringify(listing));
    });
    vi.stubGlobal("fetch", fetch);
    renderPage(
      <EvalsProvider source="api/reports/a">
        <EvalsPage report={withEvals(null)} />
      </EvalsProvider>,
    );

    const box = await screen.findByLabelText("A passage a reading must contain");
    await userEvent.type(box, "Total due 5,100.00");
    await userEvent.click(screen.getByRole("button", { name: "Expect it" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("api/reports/a/evals", expect.objectContaining({ method: "POST" })),
    );
    expect(await screen.findByText("Total due 5,100.00")).toBeInTheDocument();
    // Scored without being asked: the scoreboard is there, and nothing says to run it again.
    const board = within(await screen.findByRole("region", { name: "Scoreboard" }));
    expect(board.getByText("1 of 1")).toBeInTheDocument();
    expect(screen.queryByText(/not checked yet/)).not.toBeInTheDocument();

    const before = fetch.mock.calls.filter(([url]) => String(url).endsWith("/score")).length;
    await userEvent.click(screen.getByRole("button", { name: "Run evals" }));
    await waitFor(() =>
      expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/score")).length).toBe(before + 1),
    );
  });
});
