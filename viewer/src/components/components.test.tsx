import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "./DataTable";
import { ReadinessChart } from "./ReadinessChart";
import { Section, SectionStack } from "./Section";
import { Stat } from "./Stat";
import { ModeToggle } from "./ModeToggle";
import { TooltipProvider } from "./ui/tooltip";
import { ToneBadge } from "./ToneBadge";

describe("ReadinessChart", () => {
  it("reads the score and the bands out", () => {
    render(
      <ReadinessChart
        score="93"
        value={93}
        tone="good"
        caption="ready"
        bands={[
          { id: "ready", label: "Ready", count: 8, tone: "good" },
          { id: "workable", label: "Workable", count: 1, tone: "neutral" },
        ]}
      />,
    );
    expect(screen.getByText("Readiness 93, ready: 8 ready, 1 workable")).toBeInTheDocument();
  });
});

interface Row {
  name: string;
  n: number;
}
const column = createColumnHelper<Row>();
const columns: Columns<Row> = [
  column.accessor("name", { header: "Loader" }),
  column.accessor("n", { header: "Documents", meta: { numeric: true } }),
];

describe("DataTable", () => {
  function renderTable() {
    render(
      <DataTable
        caption="Loaders"
        columns={columns}
        rows={[
          { name: "pypdf", n: 9 },
          { name: "pdfplumber", n: 8 },
        ]}
        rowKey={(row) => row.name}
        sortable
      />,
    );
    return screen.getByRole("table", { name: "Loaders" });
  }

  it("renders a row per item, with figures aligned right", () => {
    const table = renderTable();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("8")).toHaveClass("text-right");
  });

  it("sorts from a header, largest figure first", async () => {
    const table = renderTable();
    const firstCell = () => within(within(table).getAllByRole("row")[1] as HTMLElement).getAllByRole("cell")[0];
    await userEvent.click(within(table).getByRole("button", { name: "Documents" }));
    expect(firstCell()).toHaveTextContent("pypdf");
    await userEvent.click(within(table).getByRole("button", { name: "Documents" }));
    expect(firstCell()).toHaveTextContent("pdfplumber");
  });
});

describe("Section", () => {
  it("names the region by its heading", () => {
    render(<Section title="In numbers" aside="9 documents">content</Section>);
    const section = screen.getByRole("region", { name: "In numbers" });
    expect(within(section).getByRole("heading", { level: 2 })).toHaveTextContent("In numbers");
    expect(within(section).getByText("9 documents")).toBeInTheDocument();
  });

  it("separates stacked sections, skipping the ones that render nothing", () => {
    render(
      <SectionStack>
        <Section title="One">a</Section>
        {false}
        <Section title="Two">b</Section>
      </SectionStack>,
    );
    expect(screen.getAllByRole("region")).toHaveLength(2);
    expect(document.querySelectorAll("[data-slot=separator]")).toHaveLength(1);
  });
});

describe("Stat and ToneBadge", () => {
  it("shows a figure with its label and note", () => {
    render(<Stat label="Pages" value="9" note="all read" />);
    expect(screen.getByText("Pages")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("all read")).toBeInTheDocument();
  });

  it("maps a tone to a badge variant", () => {
    render(<ToneBadge tone="warn">close</ToneBadge>);
    expect(screen.getByText("close")).toHaveAttribute("data-variant", "warning");
  });
});

describe("ModeToggle", () => {
  it("shows the theme in use and offers the other", async () => {
    const onToggle = vi.fn();
    render(
      <TooltipProvider>
        <ModeToggle dark={false} onToggle={onToggle} />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Switch to the dark theme" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
