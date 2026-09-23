import { DataTable, type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatScore, formatSeconds } from "@/report/format";
import { rankedLoaders } from "@/report/select";
import type { LoaderComparison, LoaderRow } from "@/report/types";

/** The loaders side by side. Columns that would say nothing for this run are left out. */
export function LoaderTable({ comparison }: { comparison: LoaderComparison }) {
  const columns: Column<LoaderRow>[] = [
    {
      header: "Loader",
      cell: (row) => (
        <span className="flex items-center gap-2 font-medium">
          {row.name}
          {row.name === comparison.recommended && <Badge variant="success">recommended</Badge>}
        </span>
      ),
    },
    { header: "Documents", cell: (row) => formatCount(row.documents), numeric: true },
    { header: "Characters", cell: (row) => formatCount(row.characters), numeric: true },
    { header: "Load time", cell: (row) => formatSeconds(row.seconds), numeric: true },
    { header: "Readiness", cell: (row) => formatScore(row.readiness_score), numeric: true },
  ];
  if (comparison.facts.length > 0) {
    columns.push({ header: "Facts kept", cell: (row) => `${row.facts_found} of ${comparison.facts.length}`, numeric: true });
  }
  if (comparison.loaders.some((row) => row.error)) {
    columns.push({ header: "Error", cell: (row) => row.error });
  }

  return <DataTable caption="Loaders compared" columns={columns} rows={rankedLoaders(comparison)} rowKey={(row) => row.name} />;
}
