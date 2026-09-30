import { useContext, type ReactNode } from "react";
import { NotInRun } from "@/components/NotInRun";
import { useHashParam } from "@/hooks/useHashRoute";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { cn } from "@/lib/utils";
import { traceOf } from "@/report/auditTrace";
import { runKind } from "@/report/collections";
import { fileName, formatCount, formatSeconds, formatUsd, plural } from "@/report/format";
import { measured } from "@/report/measured";
import { traceTotals } from "@/report/traceTree";
import type { Trace } from "@/report/traceTypes";
import type { Report } from "@/report/types";
import { RunTrace } from "./RunTrace";
import { TracePanel } from "./TracePanel";
import { TracesTable, type TracedRun } from "./TracesTable";

/** One of the figures across the runs: a label over its value. */
function Figure({ label, children, tone }: { label: string; children: ReactNode; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col px-4 first:pl-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm font-medium whitespace-nowrap tabular-nums", tone)}>{children}</dd>
    </div>
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Where a run without a trace of its own is best opened. */
function placeFor(report: Report): string {
  const kind = runKind(report);
  if (kind === "Chunks") return "#chunks";
  if (kind === "Loader comparison") return "#documents";
  return "#home";
}

/**
 * Every run of the folder or pipeline as a table, newest first, with figures across them
 * above. A run with a trace opens it in a panel over the page, the table left showing beside
 * it; any other run opens where what it holds is shown.
 */
export function PipelinePage({ report }: { report: Report }) {
  const { runs, current, open } = useContext(FolderRunsContext);
  const [panel, setPanel] = useHashParam("trace");
  const [, setSpan] = useHashParam("span");
  const trace = measured(report, "trace") ? traceOf(report) : null;

  // A report opened on its own is its only run.
  const all: TracedRun[] = runs.length
    ? runs.map((run) => ({
        run,
        trace: run.id === current ? trace : measured(run.report, "trace") ? traceOf(run.report) : null,
      }))
    : [{ run: { id: "this", name: "", report }, trace }];
  if (all.length === 1 && !trace) return <NotInRun report={report} content="trace" />;

  const traced = all.filter((r): r is TracedRun & { trace: Trace } => r.trace !== null);
  const here = current ?? "this";
  const at = traced.findIndex((r) => r.run.id === here);
  const shown = panel !== null && trace !== null && at >= 0;

  const show = (id: string) => {
    const row = all.find((r) => r.run.id === id);
    if (!row) return;
    if (id !== here) open(id);
    // The call picked belongs to the run left; the new one opens on its own.
    window.location.assign(row.trace ? "#pipeline?trace=open" : placeFor(row.run.report));
  };
  const close = () => {
    setSpan(null);
    setPanel(null);
  };
  const totals = traced.map((r) => traceTotals(r.trace));
  const priced = totals.filter((t) => t.usd !== null);
  const sending = totals.filter((t) => t.hosts.length > 0 && (t.identifiersSent ?? 0) > 0).length;
  const pipeline = traced.some((r) => r.trace.kind !== "audit");
  const name = trace?.name ?? traced[0]?.trace.name ?? fileName(report.run.target);

  return (
    <div className="flex flex-col gap-4">
      <header aria-label="The pipeline" className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate font-heading text-lg leading-tight font-semibold tracking-tight">{name}</h1>
          <span className="text-xs text-muted-foreground">
            {pipeline ? "Pipeline" : "Folder"} · {plural(all.length, "run")}
          </span>
        </div>
        <dl className="flex flex-wrap divide-x">
          {totals.length > 0 && (
            <Figure label="Median duration">{formatSeconds(median(totals.map((t) => t.seconds)))}</Figure>
          )}
          {priced.length > 0 && (
            <Figure label="Total cost">{formatUsd(priced.reduce((sum, t) => sum + (t.usd ?? 0), 0))}</Figure>
          )}
          {totals.some((t) => t.hosts.length > 0) && (
            <Figure label="Runs that sent identifiers" tone={sending > 0 ? "text-destructive" : "text-success"}>
              {formatCount(sending)}
            </Figure>
          )}
        </dl>
      </header>
      <TracesTable runs={all} open={shown ? here : null} onOpen={show} />
      {shown && (
        <TracePanel
          position={{ at: at + 1, of: traced.length }}
          onClose={close}
          onPrevious={at > 0 ? () => show(traced[at - 1]?.run.id ?? here) : null}
          onNext={at < traced.length - 1 ? () => show(traced[at + 1]?.run.id ?? here) : null}
        >
          <RunTrace report={report} trace={trace} />
        </TracePanel>
      )}
    </div>
  );
}
