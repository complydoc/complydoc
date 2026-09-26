import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { fileName, formatCount } from "@/report/format";
import type { InspectedChunk } from "@/report/types";

const column = createColumnHelper<InspectedChunk>();
const numeric = { meta: { numeric: true } } as const;

const columns: Columns<InspectedChunk> = [
  column.accessor("index", { header: "#", ...numeric }),
  column.accessor((chunk) => chunk.document ?? "", {
    id: "document",
    header: "Document",
    cell: (c) => (c.getValue() ? <span title={c.getValue()}>{fileName(c.getValue())}</span> : "—"),
  }),
  column.accessor("page", { header: "Page", cell: (c) => c.getValue() ?? "—", ...numeric }),
  column.accessor("tokens", { header: "Tokens", cell: (c) => formatCount(c.getValue()), ...numeric }),
  column.accessor((chunk) => chunk.identifiers.length, {
    id: "identifiers",
    header: "Identifiers",
    cell: (c) => <span title={c.row.original.identifiers.join("; ")}>{c.getValue()}</span>,
    ...numeric,
  }),
  column.accessor("hidden", {
    header: "Hidden",
    cell: (c) => <span className={c.getValue() > 0 ? "text-destructive" : undefined}>{c.getValue()}</span>,
    ...numeric,
  }),
  column.accessor((chunk) => chunk.flags.join(" "), {
    id: "flags",
    header: "Flags",
    cell: (c) => (
      <span className="flex flex-wrap gap-1">
        {c.row.original.flags.map((flag) => (
          <Badge key={flag} variant="warning" className="font-mono">
            {flag}
          </Badge>
        ))}
      </span>
    ),
  }),
  column.accessor("preview", {
    header: "Preview",
    cell: (c) => <span className="line-clamp-2 max-w-md text-xs text-muted-foreground">{c.getValue()}</span>,
  }),
];

/** Every chunk the splitter made, in order, with what was found in it. */
export function ChunkTable({ chunks }: { chunks: InspectedChunk[] }) {
  return (
    <DataTable
      caption="Chunks"
      columns={columns}
      rows={chunks}
      rowKey={(chunk) => String(chunk.index)}
      sortable
      search="Search chunks"
      pageSize={50}
    />
  );
}
