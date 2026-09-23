import { render, screen, within } from "@testing-library/react";
import { sampleReport } from "@/test/sample";
import { SummaryPage } from "./SummaryPage";

describe("SummaryPage", () => {
  it("leads with the folder's score and its factors", () => {
    render(<SummaryPage report={sampleReport()} />);
    const readiness = screen.getByRole("region", { name: "Readiness" });
    expect(within(readiness).getByText(/Readiness 93, ready/)).toBeInTheDocument();
    expect(within(readiness).getByRole("list", { name: "Factors" }).children).toHaveLength(3);
  });

  it("lists the quick wins with how many documents each touches", () => {
    render(<SummaryPage report={sampleReport()} />);
    const wins = screen.getByRole("region", { name: "Quick wins" });
    expect(within(wins).getAllByRole("listitem")).toHaveLength(3);
    expect(within(wins).getByText("3 documents")).toBeInTheDocument();
  });

  it("keeps loader caveats off the summary", () => {
    render(<SummaryPage report={sampleReport()} />);
    expect(screen.queryByText(/pdfplumber/)).not.toBeInTheDocument();
  });
});
