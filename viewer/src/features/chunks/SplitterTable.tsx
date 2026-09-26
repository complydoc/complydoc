import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "@/components/DataTable";
import { factCounts, flaggedChunks, meanReciprocalRank, retrievalHitRate } from "@/report/chunks";
import { formatCount, formatPercent } from "@/report/format";
import type { ChunkRun } from "@/report/types";

const column = createColumnHelper<ChunkRun>();
const numeric = { meta: { numeric: true } } as const;

/** Every splitter the run tried, side by side. Columns for facts and questions only when the run had them. */
export function SplitterTable({ runs }: { runs: ChunkRun[] }) {
  const columns: Columns<ChunkRun> = [
    column.accessor("chunker", { header: "Splitter", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
    column.accessor((run) => run.stats.count, { id: "chunks", header: "Chunks", cell: (c) => formatCount(c.getValue()), ...numeric }),
    column.accessor((run) => run.stats.tokens_median, { id: "median", header: "Median tokens", ...numeric }),
    column.accessor((run) => run.stats.tokens_max, { id: "max", header: "Max tokens", ...numeric }),
    column.accessor((run) => flaggedChunks(run), { id: "flagged", header: "Flagged", ...numeric }),
  ];
  if (runs.some((run) => run.facts.length > 0)) {
    columns.push(
      column.accessor((run) => factCounts(run).whole, {
        id: "facts",
        header: "Facts whole",
        cell: (c) => `${c.getValue()} of ${c.row.original.facts.length}`,
        ...numeric,
      }),
    );
  }
  if (runs.some((run) => run.retrieval.length > 0)) {
    columns.push(
      column.accessor((run) => retrievalHitRate(run), {
        id: "retrieved",
        header: "Retrieved",
        cell: (c) => (c.getValue() === null ? "—" : formatPercent(c.getValue() as number)),
        ...numeric,
      }),
      column.accessor((run) => meanReciprocalRank(run), {
        id: "mrr",
        header: "MRR",
        cell: (c) => (c.getValue() === null ? "—" : (c.getValue() as number).toFixed(2)),
        ...numeric,
      }),
    );
  }
  return <DataTable caption="Splitters" columns={columns} rows={runs} rowKey={(run) => run.chunker} />;
}
