import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import type { Loaded } from "@/report/collections";
import { sampleAudit, sampleReport } from "@/test/sample";
import { traceReport } from "@/test/trace";
import { RunsPage } from "./RunsPage";

function at(started: string) {
  const report = sampleAudit();
  return { ...report, run: { ...report.run, started_at: started } };
}

const runs: Loaded[] = [
  { id: "new", name: "new.json", report: at("2026-09-03T10:00:00+00:00") },
  { id: "loaders", name: "loaders.json", report: sampleReport() },
  { id: "old", name: "old.json", report: at("2026-09-01T10:00:00+00:00") },
];

describe("RunsPage", () => {
  it("lists every run of the folder by kind, with what each holds", () => {
    render(
      <FolderRunsContext.Provider value={{ runs, current: "new", open: () => {} }}>
        <RunsPage />
      </FolderRunsContext.Provider>,
    );
    const table = screen.getByRole("table", { name: "Runs" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("Loader comparison")).toBeInTheDocument();
    expect(within(table).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("opens a run on its Home from a click on its row", async () => {
    const open = vi.fn();
    render(
      <FolderRunsContext.Provider value={{ runs, current: "new", open }}>
        <RunsPage />
      </FolderRunsContext.Provider>,
    );
    await userEvent.click(screen.getByText("Loader comparison"));
    expect(open).toHaveBeenCalledWith("loaders");
    expect(window.location.hash).toBe("#home");
  });

  it("compares two runs of a pipeline, step by step", async () => {
    const pipeline = (id: string, started: string): Loaded => {
      const report = traceReport();
      return { id, name: `${id}.json`, report: { ...report, run: { ...report.run, started_at: started } } };
    };
    const runs = [pipeline("b", "2026-09-03T10:00:00+00:00"), pipeline("a", "2026-09-01T10:00:00+00:00")];
    render(
      <FolderRunsContext.Provider value={{ runs, current: "b", open: () => {} }}>
        <RunsPage />
      </FolderRunsContext.Provider>,
    );
    // Asked for afresh each time: ticking one draws the rows again.
    const box = (index: number) =>
      within(screen.getByRole("table", { name: "Runs" })).getAllByRole("checkbox")[index] as HTMLElement;
    await userEvent.click(box(0));
    await userEvent.click(box(1));
    const steps = screen.getByRole("table", { name: "Steps compared" });
    expect(within(steps).getAllByRole("row")).toHaveLength(5);
    expect(screen.getByRole("table", { name: "The two runs" })).toHaveTextContent("Identifiers sent");
  });
});
