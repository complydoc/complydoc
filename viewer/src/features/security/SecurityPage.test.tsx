import { render, screen, within } from "@testing-library/react";
import { sampleAudit } from "@/test/sample";
import { SecurityPage } from "./SecurityPage";

describe("SecurityPage", () => {
  it("counts by severity, and the hidden instructions", () => {
    render(<SecurityPage report={sampleAudit()} />);
    const found = screen.getByRole("region", { name: "Found" });
    expect(within(found).getByText("High severity").nextElementSibling).toHaveTextContent(/\d+/);
    expect(within(found).getByText("Hidden instructions").nextElementSibling).toHaveTextContent("2");
  });

  it("charts what was found and where, side by side", () => {
    render(<SecurityPage report={sampleAudit()} />);
    const charts = screen.getByRole("region", { name: "What and where" });
    expect(within(charts).getByText("By kind")).toBeInTheDocument();
    expect(within(charts).getByText("By document")).toBeInTheDocument();
  });

  it("quotes each hidden instruction with where it is and why it was flagged", () => {
    render(<SecurityPage report={sampleAudit()} />);
    const hidden = screen.getByRole("list", { name: "Hidden instructions" });
    expect(within(hidden).getAllByRole("listitem")).toHaveLength(2);
    expect(within(hidden).getAllByText("white text").length).toBeGreaterThan(0);
    expect(within(hidden).getAllByText("addresses an AI model directly").length).toBeGreaterThan(0);
  });

  it("lists every finding masked, each linking to its document", () => {
    const report = sampleAudit();
    render(<SecurityPage report={report} />);
    const table = screen.getByRole("table", { name: "Every finding" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(report.aggregate.sensitive_total);
    expect(rows[0]).toHaveTextContent("high");
    expect(rows[0]).toHaveTextContent("checksum passed");
    expect(within(rows[0] as HTMLElement).getByRole("link")).toHaveAttribute("href", expect.stringMatching(/^#documents\/\d+$/));
  });
});
