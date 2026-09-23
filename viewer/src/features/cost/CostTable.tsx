import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "@/components/DataTable";
import { ProviderBadge } from "@/components/ProviderBadge";
import { Badge } from "@/components/ui/badge";
import type { CostRow } from "@/report/cost";
import { formatUsd } from "@/report/format";

const column = createColumnHelper<CostRow>();
const numeric = { meta: { numeric: true }, sortUndefined: "last" } as const;

const columns: Columns<CostRow> = [
  column.accessor("name", { header: "Model", cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
  column.accessor("provider", { header: "Provider", cell: (c) => <ProviderBadge provider={c.getValue()} /> }),
  column.accessor("verified", {
    header: "Price",
    cell: (c) => <Badge variant={c.getValue() ? "success" : "outline"}>{c.getValue() ? "verified" : "imported"}</Badge>,
  }),
  column.accessor((row) => row.text ?? undefined, { id: "text", header: "Text + OCR", cell: (c) => formatUsd(c.getValue() ?? null), ...numeric }),
  column.accessor((row) => row.vision ?? undefined, { id: "vision", header: "As images", cell: (c) => formatUsd(c.getValue() ?? null), ...numeric }),
];

/** Every model priced, with what a thousand documents cost each way. */
export function CostTable({ rows }: { rows: CostRow[] }) {
  return <DataTable caption="Cost per 1,000 documents, by model" columns={columns} rows={rows} rowKey={(row) => row.id} sortable />;
}
