import { createColumnHelper } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type Columns } from "./DataTable";
import { Toaster } from "./Toaster";
import { ContextMenuItem } from "./ui/context-menu";
import { TooltipProvider } from "./ui/tooltip";
import { copyWithToast } from "@/lib/toast";

interface Row {
  name: string;
}

const column = createColumnHelper<Row>();
const columns: Columns<Row> = [column.accessor("name", { header: "Name" })];
const rows = Array.from({ length: 45 }, (_, index) => ({ name: `contract-${index + 1}.pdf` }));

function table() {
  render(
    <DataTable
      caption="Files"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.name}
      search="Search files"
      pageSize={20}
    />,
  );
  return screen.getByRole("table", { name: "Files" });
}

describe("DataTable", () => {
  it("shows a page of rows at a time, and steps through them", async () => {
    const files = table();
    expect(within(files).getAllByRole("row")).toHaveLength(21);
    expect(screen.getByText("1–20 of 45")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("41–45 of 45")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("narrows the rows to what is searched for, from the first page", async () => {
    const files = table();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search files" }), "contract-4");
    // contract-4 and contract-40 to 45: one page, so no pager.
    expect(within(files).getAllByRole("row")).toHaveLength(8);
    expect(screen.queryByRole("navigation", { name: "Files pages" })).not.toBeInTheDocument();
  });

  it("says when nothing matches", async () => {
    table();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search files" }), "invoice");
    expect(screen.getByText("Nothing matches “invoice”.")).toBeInTheDocument();
  });

  it("opens a row from anywhere on it, and leaves the row's own buttons their clicks", async () => {
    const withButton: Columns<Row> = [
      column.accessor("name", { header: "Name" }),
      column.display({ id: "act", header: "Act", cell: () => <button type="button">Ignore</button> }),
    ];
    window.location.hash = "";
    render(
      <DataTable
        caption="Files"
        columns={withButton}
        rows={rows.slice(0, 2)}
        rowKey={(row) => row.name}
        rowHref={(row) => `#documents/${row.name}`}
      />,
    );
    await userEvent.click(screen.getAllByRole("button", { name: "Ignore" })[0] as HTMLElement);
    expect(window.location.hash).toBe("");
    await userEvent.click(screen.getByText("contract-2.pdf"));
    expect(window.location.hash).toBe("#documents/contract-2.pdf");
  });

  it("offers a row's actions on a right-click, and says when one is done", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <>
        <DataTable
          caption="Files"
          columns={columns}
          rows={rows.slice(0, 3)}
          rowKey={(row) => row.name}
          rowMenu={(row) => (
            <ContextMenuItem onSelect={() => copyWithToast(row.name, "Path")}>Copy path</ContextMenuItem>
          )}
        />
        <Toaster />
      </>,
    );
    const row = within(screen.getByRole("table", { name: "Files" })).getAllByRole("row")[2] as HTMLElement;
    await userEvent.pointer({ keys: "[MouseRight]", target: row });
    await userEvent.click(await screen.findByRole("menuitem", { name: "Copy path" }));
    expect(writeText).toHaveBeenCalledWith("contract-2.pdf");
    expect(await screen.findByText("Path copied")).toBeInTheDocument();
  });

  it("keeps its sort and search in the address, under its own name", async () => {
    window.location.hash = "#documents";
    render(
      <DataTable
        caption="Files"
        columns={columns}
        rows={rows.slice(0, 5)}
        rowKey={(row) => row.name}
        sortable
        search="Search files"
        stateKey="files"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Name/ }));
    expect(window.location.hash).toContain("files.sort=name%3Aasc");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search files" }), "3");
    expect(window.location.hash).toContain("files.q=3");
    expect(within(screen.getByRole("table", { name: "Files" })).getAllByRole("row")).toHaveLength(2);
  });

  it("picks rows by their box or with X, acts on them together, and lets them go with Escape", async () => {
    const act = vi.fn();
    render(
      <TooltipProvider>
        <DataTable
          caption="Files"
          columns={columns}
          rows={rows.slice(0, 4)}
          rowKey={(row) => row.name}
          bulkActions={(chosen) => (
            <button type="button" onClick={() => act(chosen.map((row) => row.name))}>
              Act
            </button>
          )}
        />
      </TooltipProvider>,
    );
    const body = within(screen.getByRole("table", { name: "Files" }))
      .getAllByRole("row")
      .slice(1);
    await userEvent.click(within(body[0] as HTMLElement).getByRole("checkbox", { name: "Select this row" }));
    await userEvent.hover(body[2] as HTMLElement);
    await userEvent.keyboard("x");
    const bar = screen.getByRole("toolbar", { name: "Selected rows" });
    expect(bar).toHaveTextContent("2 selected");
    await userEvent.click(within(bar).getByRole("button", { name: "Act" }));
    expect(act).toHaveBeenCalledWith(["contract-1.pdf", "contract-3.pdf"]);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("toolbar", { name: "Selected rows" })).not.toBeInTheDocument();
  });

  it("settles once sorted, when the sort lives in the address and the table is paged", async () => {
    window.location.hash = "#pipeline";
    render(
      <DataTable
        caption="Runs"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.name}
        sortable
        pageSize={10}
        stateKey="runs"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Name/ }));
    await userEvent.click(screen.getByRole("button", { name: /Name/ }));
    expect(window.location.hash).toContain("runs.sort=name%3Adesc");
    const first = within(screen.getByRole("table", { name: "Runs" })).getAllByRole("row")[1];
    expect(first).toHaveTextContent("contract-45.pdf");
  });
});
