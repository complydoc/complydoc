import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IgnoreContext, type IgnoreState } from "@/hooks/useIgnores";
import type { Report } from "@/report/types";
import { sampleAudit } from "@/test/sample";
import { SecurityPage } from "./SecurityPage";

/** The sample, with fingerprints, and its first identifier set aside by an ignore file. */
function withIgnored(): Report {
  const report = sampleAudit();
  let n = 0;
  for (const document of report.documents)
    for (const match of document.sensitive.matches) match.fingerprint = `id-${String(n++).padStart(16, "0")}`;
  const document = report.documents.find((d) => d.sensitive.matches.length > 0);
  const match = document?.sensitive.matches.shift();
  if (!document || !match) throw new Error("the sample has no identifier");
  document.ignored = [
    { fingerprint: match.fingerprint ?? "", kind: "identifier", reason: "Our own account.", by: "Duarte", until: null, identifier: match, content: null },
  ];
  report.aggregate.ignored_total = 1;
  return report;
}

function editable(overrides: Partial<IgnoreState> = {}): IgnoreState {
  return {
    editable: true,
    file: "/work/.complydoc-ignore.yaml",
    entries: [],
    error: null,
    ignore: vi.fn(async () => true),
    unignore: vi.fn(async () => true),
    ...overrides,
  };
}

describe("ignored findings", () => {
  it("are listed apart, with the reason and who gave it, and counted", () => {
    render(<SecurityPage report={withIgnored()} />);
    const found = screen.getByRole("region", { name: "Found" });
    expect(within(found).getByText("Ignored").nextElementSibling).toHaveTextContent("1");
    const list = screen.getByRole("list", { name: "Ignored findings" });
    expect(within(list).getByText(/Our own account\./)).toBeInTheDocument();
    expect(within(list).getByText(/Duarte/)).toBeInTheDocument();
  });

  it("outside complydoc ui, the ignore button gives the command", async () => {
    render(<SecurityPage report={withIgnored()} />);
    const table = screen.getByRole("table", { name: "Every finding" });
    await userEvent.click(within(table).getAllByRole("button", { name: /Ignore/ })[0] as HTMLElement);
    expect(screen.getByText(/complydoc ignore id-\d{16} --reason/)).toBeInTheDocument();
  });

  it("in complydoc ui, asks for a reason and writes it", async () => {
    const state = editable();
    render(
      <IgnoreContext.Provider value={state}>
        <SecurityPage report={withIgnored()} />
      </IgnoreContext.Provider>,
    );
    const table = screen.getByRole("table", { name: "Every finding" });
    await userEvent.click(within(table).getAllByRole("button", { name: /Ignore/ })[0] as HTMLElement);
    const submit = screen.getByRole("button", { name: "Ignore it" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), "A test fixture.");
    await userEvent.click(submit);
    expect(state.ignore).toHaveBeenCalledWith(expect.objectContaining({ reason: "A test fixture." }));
  });

  it("a finding ignored since the run says it applies from the next one", () => {
    const report = withIgnored();
    const next = report.documents.flatMap((d) => d.sensitive.matches)[0]?.fingerprint ?? "";
    render(
      <IgnoreContext.Provider value={editable({ entries: [{ finding: next, reason: "Later." }] })}>
        <SecurityPage report={report} />
      </IgnoreContext.Provider>,
    );
    expect(screen.getAllByTitle(/^Applies from the next run\. Later\./).length).toBeGreaterThan(0);
    // And the one the run ignored is no longer in the file, so it counts again.
    expect(screen.getByText("Counted again from the next run")).toBeInTheDocument();
  });
});
