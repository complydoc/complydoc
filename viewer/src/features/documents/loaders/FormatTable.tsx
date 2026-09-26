import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatPercent } from "@/report/format";
import type { FormatComparison, FormatLoaderRow, LoaderComparison } from "@/report/types";

const column = createColumnHelper<FormatComparison>();

/** What one loader did with one file type: read it, failed on some, or was not given it. */
function Outcome({ row }: { row: FormatLoaderRow | undefined }) {
  if (!row) return <span className="text-muted-foreground">skipped</span>;
  const failed = Object.keys(row.failures).length;
  if (failed > 0) return <span className="text-destructive">failed on {formatCount(failed)}</span>;
  return (
    <span>
      {formatCount(row.documents)} read
      {row.similarity !== null && row.similarity < 1 && (
        <span className="text-muted-foreground"> · {formatPercent(row.similarity)} alike</span>
      )}
    </span>
  );
}

function Choice({ type }: { type: FormatComparison }) {
  if (type.recommended) return <Badge variant="success">{type.recommended}</Badge>;
  const only = type.loaders.length === 1 ? type.loaders[0] : undefined;
  if (only) {
    return (
      <span>
        {only.name} <span className="text-muted-foreground">(only one)</span>
      </span>
    );
  }
  if (type.loaders.length === 0) return <span className="text-muted-foreground">none meant for it</span>;
  return (
    <span className="text-muted-foreground" title={type.verdict}>
      no clear pick
    </span>
  );
}

/**
 * A row per file type, a column per loader. Each loader is given only the types
 * it is meant for, so "skipped" is not a failure.
 */
export function FormatTable({ comparison }: { comparison: LoaderComparison }) {
  const types = comparison.formats ?? [];
  const columns: Columns<FormatComparison> = [
    column.accessor("label", { header: "Type", cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
    column.accessor("documents", { header: "Files", cell: (c) => formatCount(c.getValue()), meta: { numeric: true } }),
    ...comparison.loaders.map((loader) =>
      column.display({
        id: `loader:${loader.name}`,
        header: loader.name,
        cell: (c) => <Outcome row={c.row.original.loaders.find((row) => row.name === loader.name)} />,
      }),
    ),
    column.display({ id: "use", header: "Use", cell: (c) => <Choice type={c.row.original} /> }),
  ];
  return <DataTable caption="Loaders by file type" columns={columns} rows={types} rowKey={(type) => type.format} />;
}
