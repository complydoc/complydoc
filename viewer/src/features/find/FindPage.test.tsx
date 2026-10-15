import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fate, reachedLabel, tally, type RunSighting, type Trail } from "@/report/findValue";
import { required } from "@/test/sample";
import { FindPage } from "./FindPage";

const step = (number: number, kind: string, component: string, occurrences: number, hosts: string[] = []) => ({
  step: number,
  kind,
  component,
  calls: 1,
  occurrences,
  hosts,
});

const STOPPED: RunSighting = {
  report: "ingest-2.json",
  name: "contracts-ingest",
  kind: "pipeline",
  started_at: "2026-10-03T09:00:00",
  commit: null,
  documents: [],
  steps: [
    step(1, "load", "PyPDFLoader", 1),
    step(2, "transform", "MaskIdentifiers", 0),
    step(3, "embed", "OpenAIEmbeddings", 0, ["api.openai.com"]),
  ],
  reached: 1,
  sent_to: [],
};

const SENT: RunSighting = {
  report: "ingest-1.json",
  name: "contracts-ingest",
  kind: "pipeline",
  started_at: "2026-10-02T09:00:00",
  commit: "a".repeat(40),
  documents: [{ path: "msa.pdf", pages: [3, 7], occurrences: 2 }],
  steps: [step(1, "load", "PyPDFLoader", 1), step(2, "embed", "OpenAIEmbeddings", 2, ["api.openai.com"])],
  reached: 2,
  sent_to: ["api.openai.com"],
};

const AUDIT: RunSighting = {
  ...SENT,
  report: "complydoc.json",
  name: "/work/contracts",
  kind: "audit",
  steps: [],
  reached: null,
  sent_to: [],
};

const TRAIL: Trail = {
  found: true,
  label: "IBAN",
  masked: "GB29 •••• 68 19",
  reports_searched: 4,
  runs: [STOPPED, SENT, AUDIT],
};

function served() {
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "complydoc-local";
  script.textContent = JSON.stringify({ reports: "api/reports", sources: [] });
  document.head.append(script);
  return () => script.remove();
}

afterEach(() => vi.unstubAllGlobals());

describe("finding a value", () => {
  it("says what became of the value in each run", () => {
    expect([fate(STOPPED), fate(SENT), fate(AUDIT)]).toEqual(["stopped", "sent", "read"]);
    expect(reachedLabel(STOPPED)).toBe("PyPDFLoader, step 1 of 3");
    expect(tally(TRAIL)).toEqual({ sent: 1, stopped: 1 });
  });

  it("needs complydoc ui, since it searches every run", () => {
    render(<FindPage />);
    expect(screen.getByText("Finding a value needs complydoc ui")).toBeInTheDocument();
  });

  it("follows the value down each run's steps, to where it was sent or stopped", async () => {
    const remove = served();
    const fetch = vi.fn(async () => new Response(JSON.stringify(TRAIL)));
    vi.stubGlobal("fetch", fetch);
    render(<FindPage />);

    await userEvent.type(screen.getByLabelText("The value to find"), "GB29 NWBK 6016 1331 9268 19");
    await userEvent.click(screen.getByRole("button", { name: "Find" }));
    expect(fetch).toHaveBeenCalledWith(
      "api/find",
      expect.objectContaining({ body: JSON.stringify({ value: "GB29 NWBK 6016 1331 9268 19" }) }),
    );

    expect(await screen.findByText("GB29 •••• 68 19")).toBeInTheDocument();
    expect(screen.getByText("Sent to a host in 1 run")).toBeInTheDocument();
    expect(screen.getByText("Stopped inside the pipeline in 1 run")).toBeInTheDocument();

    const [stopped, sent, audit] = screen.getAllByRole("listitem");
    expect(within(required(stopped)).getByText("Stopped after PyPDFLoader, step 1 of 3")).toBeInTheDocument();
    const rows = within(required(stopped)).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("PyPDFLoader");
    expect(rows[1]).toHaveTextContent("1 time");
    expect(rows[1]).toHaveTextContent("last step to hold it");
    expect(rows[2]).toHaveTextContent("MaskIdentifiers");
    expect(rows[2]).toHaveTextContent("not there");
    // The embedding step sent to its host, but not this value.
    expect(rows[3]).not.toHaveTextContent("api.openai.com");

    expect(within(required(sent)).getByText("Sent to api.openai.com")).toBeInTheDocument();
    expect(within(required(sent)).getByText("pages 3, 7")).toBeInTheDocument();
    expect(within(required(audit)).getByText("Read from the documents")).toBeInTheDocument();
    remove();
  });

  it("says so when no run found the value", async () => {
    const remove = served();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ...TRAIL, found: false, runs: [], label: null, masked: null }))),
    );
    render(<FindPage />);
    await userEvent.type(screen.getByLabelText("The value to find"), "nothing");
    await userEvent.click(screen.getByRole("button", { name: "Find" }));
    expect(await screen.findByText(/Not found in 4 reports/)).toBeInTheDocument();
    remove();
  });
});
