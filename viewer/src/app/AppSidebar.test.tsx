import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { sampleAudit } from "@/test/sample";
import { AppSidebar } from "./AppSidebar";

function renderSidebar(page: "home" | "chunks" = "home") {
  render(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar report={sampleAudit()} page={page} switcher={null} />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

describe("AppSidebar", () => {
  beforeEach(() => localStorage.clear());

  it("groups the pages by what they are for, with a figure where one says something", () => {
    renderSidebar();
    expect(screen.getByText("Findings")).toBeInTheDocument();
    const security = screen.getByRole("link", { name: "Security" }).closest("li");
    const documents = sampleAudit().documents.length;
    expect(
      within(screen.getByRole("link", { name: "Documents" }).closest("li") as HTMLElement).getByText(String(documents)),
    ).toBeInTheDocument();
    expect(security).not.toBeNull();
  });

  it("folds away the pages the run has nothing for, and keeps them reachable", async () => {
    renderSidebar();
    // The sample is an audit: no chunks.
    expect(screen.queryByRole("link", { name: "Chunks" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Not in this run/ }));
    expect(screen.getByRole("link", { name: "Chunks" })).toHaveAttribute("title", "Not in this run");
    expect(screen.getByRole("link", { name: "Security" })).not.toHaveAttribute("title");
  });

  it("shows a page the run has nothing for while it is open", () => {
    renderSidebar("chunks");
    expect(screen.getByRole("link", { name: "Chunks" })).toHaveAttribute("aria-current", "page");
  });
});
