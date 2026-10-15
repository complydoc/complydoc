import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvalsContext, type EvalsState } from "@/hooks/useEvals";
import { ExpectSelection } from "./ExpectSelection";

function state(overrides: Partial<EvalsState> = {}): EvalsState {
  return {
    editable: true,
    file: "/work/contracts/.complydoc-evals.yaml",
    facts: [],
    error: null,
    scored: null,
    running: false,
    run: vi.fn(async () => true),
    add: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    ...overrides,
  };
}

function page(evals: EvalsState) {
  return render(
    <EvalsContext.Provider value={evals}>
      <div data-testid="page-reading">
        <div id="clause">Invoices are payable within{"\n"}fourteen days of the invoice date</div>
        <div id="masked">Pay into GB29 •••• 68 19</div>
      </div>
      <p id="elsewhere">Something that is not the document</p>
      <ExpectSelection document="terms.pdf" />
    </EvalsContext.Provider>,
  );
}

/** Select an element's text, as dragging across it does, and let go of the pointer. */
async function select(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`no #${id}`);
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  await act(async () => {
    fireEvent.mouseUp(document.body);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

beforeEach(() => {
  // jsdom lays nothing out, so a range has no box of its own.
  Range.prototype.getBoundingClientRect = () => new DOMRect(100, 200, 300, 20);
});

describe("ExpectSelection", () => {
  it("expects the passage selected in the document's text, as one line of words", async () => {
    const evals = state();
    page(evals);
    expect(screen.queryByRole("button", { name: "Expect this passage" })).not.toBeInTheDocument();

    await select("clause");
    await userEvent.click(await screen.findByRole("button", { name: "Expect this passage" }));

    expect(evals.add).toHaveBeenCalledWith({
      text: "Invoices are payable within fourteen days of the invoice date",
      document: "terms.pdf",
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Expect this passage" })).not.toBeInTheDocument());
  });

  it("is not offered for text outside the document, or where the file cannot be written", async () => {
    page(state());
    await select("elsewhere");
    expect(screen.queryByRole("button", { name: "Expect this passage" })).not.toBeInTheDocument();
  });

  it("stays away when the evals file cannot be changed from here", async () => {
    page(state({ editable: false }));
    await select("clause");
    expect(screen.queryByRole("button", { name: "Expect this passage" })).not.toBeInTheDocument();
  });

  it("refuses a passage that holds a masked value, which no reading would match", async () => {
    const evals = state();
    page(evals);
    await select("masked");
    await userEvent.click(await screen.findByRole("button", { name: "Expect this passage" }));
    expect(evals.add).not.toHaveBeenCalled();
  });
});
