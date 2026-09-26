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

  it("says a run that did not price the documents did not, and names the command for this folder", () => {
    const report = sampleAudit();
    report.run.components_run = ["sensitive"];
    report.run.target = "/work/vendor contracts";
    renderPage(<CostPage report={{ ...report, cost: null }} />);
    expect(screen.getByText("No pricing in this run")).toBeInTheDocument();
    expect(screen.getByText("complydoc cost '/work/vendor contracts'")).toBeInTheDocument();
  });

  it("tells a priced run with nothing to price apart from one that priced nothing", () => {
    renderPage(<CostPage report={{ ...sampleAudit(), cost: null }} />);
    expect(screen.getByText("Nothing in this run could be priced")).toBeInTheDocument();
  });
});
