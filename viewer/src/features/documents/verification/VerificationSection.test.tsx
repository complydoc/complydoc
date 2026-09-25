import { screen, within } from "@testing-library/react";
import { renderPage } from "@/test/render";
import { TooltipProvider } from "@/components/ui/tooltip";
import { sampleAudit, sampleVerified } from "@/test/sample";
import { DocumentsPage } from "../DocumentsPage";

describe("the vision check on the Documents page", () => {
  it("leads with the headline and what the reads cost", () => {
    renderPage(<DocumentsPage report={sampleVerified()} open={null} />);
    const section = screen.getByRole("region", { name: "Vision check" });
    expect(within(section).getByRole("status")).toHaveTextContent("1 disagrees");
    const stat = within(section).getByText("Cost of the reads").closest("[data-slot=card]") as HTMLElement;
    expect(stat).toHaveTextContent("$0.0175");
    expect(stat).toHaveTextContent("from the provider's token counts");
  });

  it("lists each disputed page with what the kept reading lacks, opening that page", () => {
    const report = sampleVerified();
    renderPage(<DocumentsPage report={report} open={null} />);
    const section = screen.getByRole("region", { name: "Vision check" });
    const rows = within(section).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("disagrees");
    expect(rows[1]).toHaveTextContent("“A line only the picture had”");
    const page = report.documents[0]?.extracted_text[0]?.number;
    expect(within(rows[1] as HTMLElement).getByRole("link")).toHaveAttribute("href", `#documents/0/${page}`);
  });

  it("adds a vision column to the documents table", () => {
    renderPage(<DocumentsPage report={sampleVerified()} open={null} />);
    const table = screen.getByRole("table", { name: "Documents" });
    expect(within(table).getByRole("columnheader", { name: /Vision check/ })).toBeInTheDocument();
    expect(within(table).getByText(/1 of 1 disagree/)).toBeInTheDocument();
  });

  it("is absent from a run that verified nothing", () => {
    renderPage(<DocumentsPage report={sampleAudit()} open={null} />);
    expect(screen.queryByRole("region", { name: "Vision check" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Vision check/ })).not.toBeInTheDocument();
  });

  it("puts the vision reading's cost beside the page, and says what the check found", () => {
    renderPage(
      <TooltipProvider>
        <DocumentsPage report={sampleVerified()} open="0" />
      </TooltipProvider>,
    );
    expect(screen.getByRole("note")).toHaveTextContent("A line only the picture had");
    expect(screen.getAllByText("free · local").length).toBeGreaterThan(0);
  });

  it("prices each reading of the page on the model chosen", () => {
    renderPage(<DocumentsPage report={sampleVerified()} open="0" />);
    expect(screen.getByRole("group", { name: "Cost and time" })).toHaveTextContent(/\$\d/);
    expect(screen.getAllByText(/per page on /).length).toBeGreaterThan(0);
  });
});
