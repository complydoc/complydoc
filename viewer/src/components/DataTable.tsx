import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  /** Let a reader sort by a column's header. Worth it on a long table; noise on a short one. */
  sortable?: boolean;
  /** A search box over the rows, with this placeholder. Matches any column's text. */
  search?: string;
  /** Rows per page. Without it every row shows. */
  pageSize?: number;
}

const SORT_ICON = {
  asc: ArrowUpIcon,
  desc: ArrowDownIcon,
  none: ArrowUpDownIcon,
};

/**
 * shadcn's data table: TanStack Table on the Table component, on a card.
 * When `sortable`, a column with an accessor sorts from its header. The caption is for screen
 * readers; the section heading shows it.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  sortable = false,
  search,
  pageSize,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [query, setQuery] = useState("");
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: pageSize ?? rows.length,
  });
  // TanStack Table returns functions the React Compiler cannot memoise; it is the documented way to use it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: rowKey,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuery,
    onPaginationChange: setPagination,
    globalFilterFn: "includesString",
    // A new search starts from the first page.
    autoResetPageIndex: true,
    enableSorting: sortable,
    state: { sorting, globalFilter: query, pagination },
  });
  const matching = table.getFilteredRowModel().rows.length;
  const first = pagination.pageIndex * pagination.pageSize;
  const paged = pageSize !== undefined && matching > pageSize;

  return (
    <div className="flex flex-col gap-3">
      {search !== undefined && (
        <div className="relative max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={search}
            aria-label={search}
            className="pl-8"
          />
        </div>
      )}
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
            {matching === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                  Nothing matches “{query}”.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      {paged && (
        <nav
          aria-label={`${caption} pages`}
          className="flex items-center justify-between gap-4 text-sm text-muted-foreground"
        >
          <span>
            {first + 1}–{Math.min(first + pagination.pageSize, matching)} of {matching}
          </span>
          <span className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="tabular-nums">
              {pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRightIcon />
            </Button>
          </span>
        </nav>
      )}
    </div>
  );
}
