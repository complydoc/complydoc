import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { sampleAudit } from "@/test/sample";
import { GoTo } from "./GoTo";

describe("GoTo", () => {
  it("opens from the keyboard and jumps to a document by part of its name", async () => {
    const report = sampleAudit();
    window.location.hash = "";
    render(
      <TooltipProvider>
        <SidebarProvider>
          <GoTo report={report} />
        </SidebarProvider>
      </TooltipProvider>,
    );
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(await screen.findByPlaceholderText(/A page, a document or a run/), "annual");
    await userEvent.click(await screen.findByRole("option", { name: /annual-report-2025\.pdf/ }));
    const index = report.documents.findIndex((d) => d.relative_path === "annual-report-2025.pdf");
    expect(window.location.hash).toBe(`#documents/${index}`);
  });
});
