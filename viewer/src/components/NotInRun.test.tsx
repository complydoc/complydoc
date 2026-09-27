import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import type { Loaded } from "@/report/collections";
import type { ChunkRun } from "@/report/types";
import { sampleAudit } from "@/test/sample";
import { NotInRun } from "./NotInRun";

const audit = sampleAudit();
const chunks = {
  ...audit,
  documents: [],
  chunks: [{} as ChunkRun],
  run: { ...audit.run, components_run: [], started_at: "2026-09-02T10:00:00+00:00" },
};
const runs: Loaded[] = [
  { id: "chunks", name: "chunks.json", report: chunks },
  { id: "audit", name: "audit.json", report: audit },
];

describe("NotInRun", () => {
  it("offers the folder's run that has it before a command to make it", async () => {
    const open = vi.fn();
    render(
      <FolderRunsContext.Provider value={{ runs, current: "audit", open }}>
        <NotInRun report={audit} content="chunks" />
      </FolderRunsContext.Provider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Open the chunks run of/ }));
    expect(open).toHaveBeenCalledWith("chunks");
    expect(screen.getByText(/complydoc chunks/)).toBeInTheDocument();
  });

  it("gives only the command where no run of the folder has it", () => {
    render(
      <FolderRunsContext.Provider value={{ runs, current: "audit", open: () => {} }}>
        <NotInRun report={audit} content="loaders" />
      </FolderRunsContext.Provider>,
    );
    expect(screen.queryByRole("button", { name: /^Open the/ })).not.toBeInTheDocument();
  });
});
