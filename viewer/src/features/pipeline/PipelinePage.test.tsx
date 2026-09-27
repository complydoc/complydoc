import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { required, sampleAudit } from "@/test/sample";
import { traceReport } from "@/test/trace";
import { PipelinePage } from "./PipelinePage";

describe("PipelinePage", () => {
  it("says first what left the machine, and what it held", () => {
    renderPage(<PipelinePage report={traceReport()} />);
    const sent = screen.getByRole("status");
    expect(sent).toHaveTextContent("OpenAIEmbeddings sent 9 texts to api.example.com");
    expect(sent).toHaveTextContent("They held 2 identifiers, 1 of them high severity");
  });

  it("lays the steps out in order, and shows the one picked", async () => {
    renderPage(<PipelinePage report={traceReport()} />);
    const steps = screen.getByRole("list", { name: "Steps" });
    const cards = within(steps).getAllByRole("button");
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("PyPDFLoader"),
      expect.stringContaining("StripPathMetadata"),
      expect.stringContaining("RecursiveCharacterTextSplitter"),
      expect.stringContaining("OpenAIEmbeddings"),
    ]);
    // It opens on the step that sent text away.
    expect(cards[3]).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(required(cards[2]));
    expect(screen.getByText("chunk_size")).toBeInTheDocument();
    expect(within(steps).getByText("paths removed")).toBeInTheDocument();
  });

  it("follows each identifier through the steps", () => {
    renderPage(<PipelinePage report={traceReport()} />);
    const table = screen.getByRole("table", { name: "Where each identifier went" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getAllByTitle("Not looked for at this step")).toHaveLength(2);
  });

  it("says a run with no pipeline has none, and how to record one", () => {
    renderPage(<PipelinePage report={sampleAudit()} />);
    expect(screen.getByText("No pipeline in this run")).toBeInTheDocument();
  });
});
