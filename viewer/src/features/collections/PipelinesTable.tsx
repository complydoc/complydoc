import { createColumnHelper } from "@tanstack/react-table";
import { WorkflowIcon } from "lucide-react";
import { DataTable, type Columns } from "@/components/DataTable";
import { runLabel, type Collection } from "@/report/collections";
import { formatCount, formatPageUsd, formatSeconds, plural } from "@/report/format";
import { runFigures, type RunFigures } from "@/report/traceCompare";

interface Row {
  id: string;
  name: string;
  runs: number;
  lastRun: string;
  figures: RunFigures;
}

function rowsOf(pipelines: Collection[]): Row[] {
  return pipelines.flatMap((pipeline) => {
    const latest = pipeline.runs[0];
    const trace = latest?.report.trace;
    if (!latest || !trace) return [];
    return [
      {
        id: pipeline.id,
        name: pipeline.name,
        runs: pipeline.runs.length,
        lastRun: runLabel(latest.report),
        figures: runFigures(trace),
      },
    ];
  });
}

const column = createColumnHelper<Row>();
const numeric = { meta: { numeric: true }, sortUndefined: "last" } as const;

function columnsFor(onOpen: (id: string) => void): Columns<Row> {
  return [
    column.accessor("name", {
      header: "Pipeline",
      cell: ({ row, getValue }) => (
        <button
          type="button"
          onClick={() => onOpen(row.original.id)}
          className="flex items-center gap-2 text-left font-medium underline-offset-4 hover:underline"
        >
          <WorkflowIcon className="size-4 shrink-0 text-muted-foreground" />
          {getValue()}
        </button>
      ),
    }),
    column.accessor("lastRun", {
      header: "Last run",
      cell: ({ row, getValue }) => (
        <span className="text-muted-foreground">
          {getValue()}
          {row.original.runs > 1 && <span className="text-xs"> · {plural(row.original.runs, "run")}</span>}
        </span>
      ),
    }),
    column.accessor((row) => row.figures.seconds, {
      id: "took",
      header: "Took",
      cell: (c) => formatSeconds(c.getValue()),
      ...numeric,
    }),
    column.accessor((row) => row.figures.usd ?? undefined, {
      id: "cost",
      header: "Cost",
      cell: ({ row }) => formatPageUsd(row.original.figures.usd),
      ...numeric,
    }),
    column.accessor((row) => row.figures.identifiersSent ?? undefined, {
      id: "sent",
      header: "Identifiers sent",
      cell: ({ row }) => {
        const sent = row.original.figures.identifiersSent;
        if (sent === null) return <span className="text-xs text-muted-foreground">not scanned</span>;
        return <span className={sent > 0 ? "text-destructive tabular-nums" : "tabular-nums"}>{formatCount(sent)}</span>;
      },
      ...numeric,
    }),
  ];
}

/** Every pipeline open, each by its latest run: how long it took, what it cost, what it sent. */
export function PipelinesTable({ pipelines, onOpen }: { pipelines: Collection[]; onOpen: (id: string) => void }) {
  return (
    <DataTable
      caption="Pipelines"
      columns={columnsFor(onOpen)}
      rows={rowsOf(pipelines)}
      rowKey={(row) => row.id}
      sortable
    />
  );
}
