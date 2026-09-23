import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Figures are right-aligned so their digits line up. */
    numeric?: boolean;
  }
}

// `any` is TanStack's own choice for a column's value type in a mixed list of columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Columns<T> = ColumnDef<T, any>[];

interface DataTableProps<T> {
  caption: string;
  columns: Columns<T>;
  rows: T[];
  rowKey: (row: T) => string;
}

const SORT_ICON = { asc: ArrowUpIcon, desc: ArrowDownIcon, none: ArrowUpDownIcon };

/**
 * shadcn's data table: TanStack Table on the Table component, on a card.
 * A column with an accessor sorts from its header. The caption is for screen
 * readers; the section heading shows it.
 */
export function DataTable<T>({ caption, columns, rows, rowKey }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  // TanStack Table returns functions the React Compiler cannot memoise; it is the documented way to use it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: rowKey,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <Card className="py-0">
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const numeric = header.column.columnDef.meta?.numeric;
                const label = flexRender(header.column.columnDef.header, header.getContext());
                const Icon = SORT_ICON[header.column.getIsSorted() || "none"];
                return (
                  <TableHead key={header.id} className={cn("first:pl-4 last:pr-4", numeric && "text-right")}>
                    {header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn("-mx-2.5", numeric && "flex-row-reverse")}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {label}
                        <Icon data-icon={numeric ? "inline-start" : "inline-end"} className="text-faint" />
                      </Button>
                    ) : (
                      label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn("first:pl-4 last:pr-4", cell.column.columnDef.meta?.numeric && "text-right")}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
