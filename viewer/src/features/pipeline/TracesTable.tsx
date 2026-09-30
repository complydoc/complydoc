import { createColumnHelper } from "@tanstack/react-table";
import { CircleCheckIcon, CircleXIcon, TriangleAlertIcon } from "lucide-react";
import { DataTable, type Columns } from "@/components/DataTable";
import { cn } from "@/lib/utils";
import type { Loaded } from "@/report/collections";
import { formatCount, formatSeconds, formatUsd, plural } from "@/report/format";
import { traceTotals } from "@/report/traceTree";
import type { Trace } from "@/report/traceTypes";
import { stepsOf } from "@/report/traceView";
import { formatStarted } from "./started";

/** A run of the pipeline, with its trace. */
export interface TracedRun {
  run: Loaded;
  trace: Trace;
}

interface Row {
  id: string;
  error: string | null;
  started: string;
  steps: string;
  seconds: number;
  warnings: number;
  tokens: number | null;
  usd: number | null;
  hosts: string;
  sent: number | null;
}

function rowOf({ run, trace }: TracedRun): Row {
  const totals = traceTotals(trace);
  return {
    id: run.id,
    error: trace.error ?? null,
    started: run.report.run.started_at,
    steps:
      trace.kind === "audit" ? plural(run.report.documents.length, "document") : plural(stepsOf(trace).length, "step"),
    seconds: totals.seconds,
    warnings: trace.stages.reduce((sum, s) => sum + (s.warnings?.length ?? 0), 0),
    tokens: totals.tokensEmbedded,
    usd: totals.usd,
    hosts: totals.hosts.join(", "),
    sent: totals.hosts.length > 0 ? totals.identifiersSent : null,
  };
}

const column = createColumnHelper<Row>();

/** The columns worth a place: a figure no run has is left out. */
function columnsFor(rows: Row[]): Columns<Row> {
  const any = (has: (row: Row) => boolean) => rows.some(has);
  return [
    column.accessor("error", {
      header: () => <span className="sr-only">Status</span>,
      cell: (c) =>
        c.getValue() ? (
          <CircleXIcon className="size-4 text-destructive" aria-label={`Raised ${c.getValue()}`} />
        ) : (
          <CircleCheckIcon className="size-4 text-success" aria-label="Finished" />
        ),
      meta: { narrow: true },
    }),
    column.accessor("started", {
      header: "Started",
      cell: (c) => <span className="tabular-nums">{formatStarted(c.getValue())}</span>,
    }),
    column.accessor("steps", {
      header: "Steps",
      cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span>,
    }),
    column.accessor("seconds", {
      header: "Duration",
      cell: (c) => formatSeconds(c.getValue()),
      meta: { numeric: true },
    }),
    ...(any((r) => r.warnings > 0)
      ? [
          column.accessor("warnings", {
            header: "Warnings",
            cell: (c) =>
              c.getValue() > 0 ? (
                <span className="inline-flex items-center gap-1 text-warning">
                  <TriangleAlertIcon className="size-3.5" />
                  {formatCount(c.getValue())}
                </span>
              ) : (
                <span className="text-muted-foreground">0</span>
              ),
            meta: { numeric: true },
          }),
        ]
      : []),
    ...(any((r) => r.tokens !== null)
      ? [
          column.accessor("tokens", {
            header: "Tokens",
            cell: (c) => (c.getValue() === null ? "—" : formatCount(c.getValue() as number)),
            meta: { numeric: true },
          }),
        ]
      : []),
    ...(any((r) => r.usd !== null)
      ? [
          column.accessor("usd", {
            header: "Cost",
            cell: (c) => (c.getValue() === null ? "—" : formatUsd(c.getValue() as number)),
            meta: { numeric: true },
          }),
        ]
      : []),
    ...(any((r) => r.hosts !== "")
      ? [
          column.accessor("hosts", {
            header: "Sent to",
            cell: (c) => <span className="font-mono text-xs">{c.getValue() || "—"}</span>,
          }),
          column.accessor("sent", {
            header: "Identifiers sent",
            cell: (c) => {
              const sent = c.getValue();
              if (sent === null) return "—";
              return <span className={cn(sent > 0 ? "text-destructive" : "text-success")}>{formatCount(sent)}</span>;
            },
            meta: { numeric: true },
          }),
        ]
      : []),
  ];
}

/** Every traced run of the pipeline, newest first; a click opens one's trace beside the table. */
export function TracesTable({
  runs,
  open,
  onOpen,
}: {
  runs: TracedRun[];
  /** The run whose trace is open, if one is. */
  open: string | null;
  onOpen: (id: string) => void;
}) {
  const rows = runs.map(rowOf);
  return (
    <DataTable
      caption="Runs"
      columns={columnsFor(rows)}
      rows={rows}
      rowKey={(row) => row.id}
      sortable={rows.length > 5}
      pageSize={50}
      onRowClick={(row) => onOpen(row.id)}
      selected={(row) => row.id === open}
    />
  );
}
