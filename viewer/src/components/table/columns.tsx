import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * The column that picks rows, Linear's way: a box that shows when the pointer is on its
 * row, and on every row once any is picked.
 */
export function selectColumn<T>(): ColumnDef<T, unknown> {
  return {
    id: "select",
    enableSorting: false,
    meta: { narrow: true },
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
        aria-label="Select every row on this page"
        className="opacity-0 transition-opacity group-hover/table:opacity-100 group-data-[picking=true]/table:opacity-100 focus-visible:opacity-100"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(value === true)}
        aria-label="Select this row"
        className="opacity-0 transition-opacity group-hover/row:opacity-100 group-data-[picking=true]/table:opacity-100 focus-visible:opacity-100"
      />
    ),
  };
}

/** Quick actions at the end of a row, there while the pointer or the keyboard is on the row. */
export function actionsColumn<T>(actions: (row: T) => ReactNode): ColumnDef<T, unknown> {
  return {
    id: "actions",
    enableSorting: false,
    meta: { narrow: true },
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
        {actions(row.original)}
      </div>
    ),
  };
}
