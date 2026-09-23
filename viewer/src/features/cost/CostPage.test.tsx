import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleAudit } from "@/test/sample";
import { CostPage } from "./CostPage";

describe("CostPage", () => {
  it("leads with the cheapest each way and how much dearer images are", () => {
    render(<CostPage report={sampleAudit()} />);
    const figures = screen.getByRole("region", { name: "Per 1,000 documents" });
    expect(within(figures).getByText("Cheapest as text").nextElementSibling).toHaveTextContent("$");
    expect(within(figures).getByText("Images cost").nextElementSibling).toHaveTextContent("×");
  });

  it("switches the chart between ways of sending the documents", async () => {
    render(<CostPage report={sampleAudit()} />);
    const images = screen.getByRole("radio", { name: "As images" });
    await userEvent.click(images);
    expect(images).toHaveAttribute("aria-checked", "true");
  });

  it("lists every model", () => {
    const report = sampleAudit();
    render(<CostPage report={report} />);
    const table = screen.getByRole("table", { name: /by model/ });
    expect(within(table).getAllByRole("row")).toHaveLength((report.cost?.models.length ?? 0) + 1);
  });

  it("says so when the report has no cost", () => {
    render(<CostPage report={{ ...sampleAudit(), cost: null }} />);
    expect(screen.getByText("No cost in this report")).toBeInTheDocument();
  });
});
