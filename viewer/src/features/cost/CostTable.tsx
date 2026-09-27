import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "@/components/DataTable";
import { ProviderBadge } from "@/components/ProviderBadge";
import type { CostRow } from "@/report/cost";
import { formatUsd } from "@/report/format";

const column = createColumnHelper<CostRow>();
const numeric = { meta: { numeric: true }, sortUndefined: "last" } as const;

const columns: Columns<CostRow> = [
  column.accessor("name", { header: "Model", cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
  column.accessor("provider", { header: "Provider", cell: (c) => <ProviderBadge provider={c.getValue()} /> }),
  column.accessor((row) => row.text ?? undefined, { id: "text", header: "Text + OCR", cell: (c) => formatUsd(c.getValue() ?? null), ...numeric }),
  column.accessor((row) => row.vision ?? undefined, { id: "vision", header: "As images", cell: (c) => formatUsd(c.getValue() ?? null), ...numeric }),
];

/**
 * Every model priced, with what a thousand documents cost each way. A run that priced no
 * page as an image leaves that column out rather than fill it with dashes.
 */
export function CostTable({ rows }: { rows: CostRow[] }) {
  const shown = rows.some((row) => row.vision !== null) ? columns : columns.filter((c) => c.id !== "vision");
  return (
    <DataTable caption="Cost per 1,000 documents, by model" columns={shown} rows={rows} rowKey={(row) => row.id} sortable />
  );
}
