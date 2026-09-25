import { createColumnHelper } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type Columns } from "./DataTable";

interface Row {
  name: string;
}

const column = createColumnHelper<Row>();
const columns: Columns<Row> = [column.accessor("name", { header: "Name" })];
const rows = Array.from({ length: 45 }, (_, index) => ({ name: `contract-${index + 1}.pdf` }));

function table() {
  render(
    <DataTable caption="Files" columns={columns} rows={rows} rowKey={(row) => row.name} search="Search files" pageSize={20} />,
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
});
