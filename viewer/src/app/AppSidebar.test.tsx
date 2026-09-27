import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { sampleAudit } from "@/test/sample";
import { AppSidebar } from "./AppSidebar";

describe("AppSidebar", () => {
  it("keeps every page reachable, and marks those the run has nothing for", () => {
    render(
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar report={sampleAudit()} page="home" switcher={null} />
        </SidebarProvider>
      </TooltipProvider>,
    );
    // The sample is an audit: no loader comparison, no chunks.
    expect(screen.getByRole("link", { name: "Loaders" })).toHaveAttribute("title", "Not in this run");
    expect(screen.getByRole("link", { name: "Chunks" })).toHaveAttribute("title", "Not in this run");
    expect(screen.getByRole("link", { name: "Security" })).not.toHaveAttribute("title");
  });
});
