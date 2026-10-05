import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { renderPage } from "@/test/render";
import { required } from "@/test/sample";
import { nestedReport } from "@/test/trace";
import { PipelinePage } from "./PipelinePage";

describe("searching a trace's calls", () => {
  it("narrows the calls as the search is typed, and the page keeps answering", async () => {
    window.location.hash = "#pipeline";
    const report = nestedReport();
    renderPage(
      <FolderRunsContext.Provider value={{ runs: [{ id: "r", name: "r.json", report }], current: "r", open: () => {} }}>
        <PipelinePage report={report} />
      </FolderRunsContext.Provider>,
    );
    const rows = within(screen.getByRole("table", { name: "Runs" })).getAllByRole("row").slice(1);
    await userEvent.click(required(within(required(rows[0])).getAllByRole("cell")[1]));
    const panel = screen.getByRole("complementary", { name: "Trace" });
    await userEvent.type(within(panel).getByRole("searchbox", { name: "Search calls" }), "pdf");
    expect(within(panel).getByRole("searchbox", { name: "Search calls" })).toHaveValue("pdf");
  });
});
