import { screen, within } from "@testing-library/react";
import { renderPage } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { sampleAudit } from "@/test/sample";
import { CostPage } from "./CostPage";

describe("CostPage", () => {
  it("leads with the ways to read the folder, without cards of cheapest prices", () => {
    renderPage(<CostPage report={sampleAudit()} />);
    const sections = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"));
    expect(sections[0]).toBe("Ways to read this folder");
    expect(sections).not.toContain("Per 1,000 documents");
    expect(sections).not.toContain("Measure more of it");
  });

  it("switches the chart between ways of sending the documents", async () => {
    renderPage(<CostPage report={sampleAudit()} />);
    const images = screen.getByRole("radio", { name: "As images" });
    await userEvent.click(images);
    expect(images).toHaveAttribute("aria-checked", "true");
  });

  it("lists every model", () => {
    const report = sampleAudit();
    renderPage(<CostPage report={report} />);
    const table = screen.getByRole("table", { name: /by model/ });
    expect(within(table).getAllByRole("row")).toHaveLength((report.cost?.models.length ?? 0) + 1);
  });

  it("says so when the report has no cost", () => {
    renderPage(<CostPage report={{ ...sampleAudit(), cost: null }} />);
    expect(screen.getByText("No cost in this report")).toBeInTheDocument();
  });
});
