import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@/components/Toaster";
import { IgnoreContext, type IgnoreState } from "@/hooks/useIgnores";
import type { FindingRow } from "@/report/security";
import { BulkIgnore } from "./BulkIgnore";

const row = (n: number): FindingRow =>
  ({
    id: `f${n}`,
    match: n,
    document: 0,
    path: "a.pdf",
    page: 1,
    label: "IBAN",
    masked: `••${n}`,
    severity: "high",
    evidence: "confirmed",
    source: { fingerprint: `id-${n}` },
  }) as unknown as FindingRow;

describe("BulkIgnore", () => {
  it("sets every picked finding aside for one reason, and says so once", async () => {
    const ignore = vi.fn(async () => true);
    const state: IgnoreState = {
      editable: true,
      file: "/work/.complydoc-ignore.yaml",
      entries: [],
      error: null,
      ignore,
      unignore: async () => true,
    };
    const done = vi.fn();
    render(
      <IgnoreContext.Provider value={state}>
        <BulkIgnore rows={[row(1), row(2), row(3)]} onDone={done} />
        <Toaster />
      </IgnoreContext.Provider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ignore…" }));
    await userEvent.type(screen.getByRole("textbox"), "Our own accounts");
    await userEvent.click(screen.getByRole("button", { name: "Ignore 3 findings" }));
    expect(ignore).toHaveBeenCalledTimes(3);
    expect(ignore).toHaveBeenCalledWith(
      { finding: "id-2", reason: "Our own accounts", what: "IBAN ••2" },
      { quiet: true },
    );
    expect(await screen.findByText("3 findings ignored")).toBeInTheDocument();
    expect(done).toHaveBeenCalled();
  });
});
