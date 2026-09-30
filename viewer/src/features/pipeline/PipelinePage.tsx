import { useContext, type ReactNode } from "react";
import { NotInRun } from "@/components/NotInRun";
import { useHashParam } from "@/hooks/useHashRoute";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { cn } from "@/lib/utils";
import { traceOf } from "@/report/auditTrace";
import { formatCount, formatSeconds, formatUsd, plural } from "@/report/format";
import { measured } from "@/report/measured";
import { traceTotals } from "@/report/traceTree";
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

/**
 * Every run of the pipeline as a table, newest first, with figures across them above; a run
 * picked opens its trace in a panel over the page, the table left showing beside it.
 */
export function PipelinePage({ report }: { report: Report }) {
  const { runs, current, open } = useContext(FolderRunsContext);
  const [panel, setPanel] = useHashParam("trace");
  const [, setSpan] = useHashParam("span");
  const trace = traceOf(report);
  if (!trace || !measured(report, "trace")) return <NotInRun report={report} content="trace" />;

  // The folder's runs with a trace of this pipeline; a report opened on its own is its only run.
  const traced: TracedRun[] = runs.flatMap((run) => {
    const other = run.id === current ? trace : traceOf(run.report);
    return other && measured(run.report, "trace") && other.kind === trace.kind && other.name === trace.name
      ? [{ run, trace: other }]
      : [];
  });
  const all = traced.length > 0 ? traced : [{ run: { id: "this", name: "", report }, trace }];
  const here = current ?? "this";
  const at = all.findIndex((r) => r.run.id === here);
  const shown = panel !== null && at >= 0;

  const show = (id: string) => {
    if (id !== here) open(id);
    // The call picked belongs to the run left; the new one opens on its own.
    window.location.assign("#pipeline?trace=open");
  };
  const close = () => {
    setSpan(null);
    setPanel(null);
  };
  const totals = all.map((r) => traceTotals(r.trace));
  const priced = totals.filter((t) => t.usd !== null);
  const sending = totals.filter((t) => t.hosts.length > 0 && (t.identifiersSent ?? 0) > 0).length;
  const audit = trace.kind === "audit";

  return (
    <div className="flex flex-col gap-4">
      <header aria-label="The pipeline" className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate font-heading text-lg leading-tight font-semibold tracking-tight">{trace.name}</h1>
          <span className="text-xs text-muted-foreground">
            {audit ? "Folder audits" : "Pipeline"} · {plural(all.length, "run")}
          </span>
        </div>
        <dl className="flex flex-wrap divide-x">
          <Figure label="Median duration">{formatSeconds(median(totals.map((t) => t.seconds)))}</Figure>
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
          position={{ at: at + 1, of: all.length }}
          onClose={close}
          onPrevious={at > 0 ? () => show(all[at - 1]?.run.id ?? here) : null}
          onNext={at < all.length - 1 ? () => show(all[at + 1]?.run.id ?? here) : null}
        >
          <RunTrace report={report} trace={trace} />
        </TracePanel>
      )}
    </div>
  );
}
