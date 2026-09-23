import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from "./DataTable";
import { ScoreRing } from "./ScoreRing";
import { Section, SectionStack } from "./Section";
import { Stat } from "./Stat";
import { ThemeToggle } from "./ThemeToggle";
import { ToneBadge } from "./ToneBadge";

describe("ScoreRing", () => {
  it("shows the score and reads the bands out", () => {
    render(
      <ScoreRing
        score="93"
        caption="ready"
        segments={[
          { label: "Ready", count: 8, tone: "good" },
          { label: "Workable", count: 1, tone: "neutral" },
        ]}
      />,
    );
    expect(screen.getByText("93")).toBeInTheDocument();
    expect(screen.getByText("8 ready, 1 workable")).toBeInTheDocument();
  });

  it("draws no arcs for an empty folder", () => {
    const { container } = render(<ScoreRing score="–" caption="not scored" segments={[]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });
});

describe("DataTable", () => {
  it("renders a row per item, with figures aligned right", () => {
    render(
      <DataTable
        caption="Loaders"
        columns={[
          { header: "Loader", cell: (row: { name: string; n: number }) => row.name },
          { header: "Documents", cell: (row) => row.n, numeric: true },
        ]}
        rows={[
          { name: "pypdf", n: 9 },
          { name: "pdfplumber", n: 8 },
        ]}
        rowKey={(row) => row.name}
      />,
    );
    const table = screen.getByRole("table", { name: "Loaders" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("8")).toHaveClass("text-right");
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

describe("ThemeToggle", () => {
  it("reports the chosen theme and ignores a second press on the same one", async () => {
    const onChange = vi.fn();
    render(<ThemeToggle theme="system" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenCalledWith("dark");
    await userEvent.click(screen.getByRole("radio", { name: "Match the system" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
