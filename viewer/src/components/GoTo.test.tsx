import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { sampleAudit } from "@/test/sample";
import { GoTo } from "./GoTo";

function menu(onShortcuts?: () => void) {
  const report = sampleAudit();
  render(
    <TooltipProvider>
      <SidebarProvider>
        <FolderRunsContext.Provider
          value={{ runs: [{ id: "r", name: "r.json", report }], current: "r", open: () => {} }}
        >
          <GoTo report={report} {...(onShortcuts ? { onShortcuts } : {})} />
        </FolderRunsContext.Provider>
      </SidebarProvider>
    </TooltipProvider>,
  );
  return report;
}

const search = () => screen.findByRole("combobox", { name: "Search pages, documents and runs" });

describe("GoTo", () => {
  beforeEach(() => {
    window.location.hash = "";
    window.localStorage.clear();
  });

  it("opens from the keyboard and jumps to a document by part of its name", async () => {
    const report = menu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(await search(), "annual");
    await userEvent.click(await screen.findByRole("option", { name: /annual-report-2025\.pdf/ }));
    const index = report.documents.findIndex((d) => d.relative_path === "annual-report-2025.pdf");
    expect(window.location.hash).toBe(`#documents/${index}`);
  });

  it("folds the sidebar away and back", async () => {
    menu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.click(await screen.findByRole("option", { name: /Collapse sidebar/ }));
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("option", { name: /Expand sidebar/ })).toBeInTheDocument();
  });

  it("shows one kind of thing at a time, from its tabs or with the arrows", async () => {
    menu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await search();
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Security/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Documents" }));
    expect(screen.queryByRole("option", { name: /Security/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /annual-report-2025\.pdf/ })).toBeInTheDocument();
    // With nothing typed, the arrows change the kind; Actions is the last.
    await userEvent.click(await search());
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Actions" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Collapse sidebar/ })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens on where the reader has just been", async () => {
    menu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(await search(), "annual");
    await userEvent.click(await screen.findByRole("option", { name: /annual-report-2025\.pdf/ }));
    await userEvent.keyboard("{Control>}k{/Control}");
    await search();
    const recents = screen.getByRole("group", { name: "Recents" });
    expect(within(recents).getByRole("option", { name: /annual-report-2025\.pdf/ })).toBeInTheDocument();
  });

  it("says which keys work, and lists the shortcuts when asked", async () => {
    const onShortcuts = vi.fn();
    menu(onShortcuts);
    await userEvent.keyboard("{Control>}k{/Control}");
    await search();
    expect(screen.getByText("Change type")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /Keyboard shortcuts/ }));
    expect(onShortcuts).toHaveBeenCalled();
  });
});
