import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatScore, formatSeconds } from "@/report/format";
import { rankedLoaders } from "@/report/select";
import type { LoaderComparison, LoaderRow } from "@/report/types";

const column = createColumnHelper<LoaderRow>();
const numeric = { meta: { numeric: true } } as const;

/** The loaders side by side, best first. Columns that would say nothing for this run are left out. */
export function LoaderTable({ comparison }: { comparison: LoaderComparison }) {
  const columns: Columns<LoaderRow> = [
    column.accessor("name", {
      header: "Loader",
      cell: (c) => (
        <span className="flex items-center gap-2 font-medium">
          {c.getValue()}
          {c.getValue() === comparison.recommended && <Badge variant="success">recommended</Badge>}
        </span>
      ),
    }),
    column.accessor("documents", { header: "Documents", cell: (c) => formatCount(c.getValue()), ...numeric }),
    column.accessor("characters", { header: "Characters", cell: (c) => formatCount(c.getValue()), ...numeric }),
    column.accessor("seconds", { header: "Load time", cell: (c) => formatSeconds(c.getValue()), ...numeric }),
    column.accessor("readiness_score", { header: "Readiness", cell: (c) => formatScore(c.getValue()), ...numeric }),
  ];
  if (comparison.facts.length > 0) {
    columns.push(
      column.accessor("facts_found", {
        header: "Facts kept",
        cell: (c) => `${c.getValue()} of ${comparison.facts.length}`,
        ...numeric,
      }),
    );
  }
  if (comparison.loaders.some((row) => row.error)) {
    columns.push(column.accessor("error", { header: "Error" }));
  }

  return <DataTable caption="Loaders compared" columns={columns} rows={rankedLoaders(comparison)} rowKey={(row) => row.name} />;
}
