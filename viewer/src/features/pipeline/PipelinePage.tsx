import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NotInRun } from "@/components/NotInRun";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHashParam } from "@/hooks/useHashRoute";
import { cn } from "@/lib/utils";
import { formatCount, formatDate, formatSeconds, formatUsd, plural } from "@/report/format";
import { sameDocument } from "@/report/chunkPlaces";
import { measured } from "@/report/measured";
import { spansOf, traceSpan, traceTotals, visibleSpans, type Span } from "@/report/traceTree";
import { changeBetween, stepsOf } from "@/report/traceView";
import type { Report } from "@/report/types";
import { SpanDetail } from "./SpanDetail";
import { SpanTree } from "./SpanTree";
import { TimeSplit } from "./TimeSplit";
import { ValueTrail } from "./ValueTrail";

function Figure({ label, children, tone }: { label: string; children: ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium tabular-nums", tone)}>{children}</span>
    </div>
  );
}

/** The report's document a call read: the one file it names, where the report holds it. */
function documentOf(report: Report, span: Span): number | null {
  const named = span.stage.kind === "document" ? (span.stage.sources[0] ?? null) : span.label || null;
  const source = named ?? (span.stage.sources.length === 1 ? (span.stage.sources[0] ?? null) : null);
  if (!source) return null;
  const index = report.documents.findIndex((d) => sameDocument(source, d.relative_path));
  return index >= 0 ? index : null;
}

function find(roots: Span[], index: number): Span | undefined {
  for (const span of roots) {
    if (span.stage.index === index) return span;
    const inside = find(span.children, index);
    if (inside) return inside;
  }
  return undefined;
}

/**
 * A run recorded with `cd.observe`, as a trace: every call the pipeline made, the calls
 * made inside each, when each ran and for how long; the call picked, with what it passed
 * on and how it was set; and its figures. The run's totals head the page. The second view
 * follows each identifier through the steps.
 */
export function PipelinePage({ report }: { report: Report }) {
  const [spanParam, setSpan] = useHashParam("span");
  const [view, setView] = useHashParam("view");
  const trace = report.trace;
  if (!trace || !measured(report, "trace")) return <NotInRun report={report} content="trace" />;

  const roots = spansOf(trace);
  // complydoc's own run of a folder: its documents, not a pipeline's steps.
  const audit = trace.kind === "audit";
  const steps = stepsOf(trace);
  const totals = traceTotals(trace);
  const sender = [...trace.stages].reverse().find((s) => s.hosts.length > 0);
  const selected = spanParam !== null ? Number(spanParam) : (sender?.index ?? roots[0]?.stage.index ?? 0);
  const span = find(roots, selected) ?? roots[0];
  if (!span) return null;
  // Against the step before, for a step the pipeline itself called.
  const at = steps.findIndex((step) => step.stages.some((s) => s.index === span.stage.index));
  const [before, current] = [steps[at - 1], steps[at]];
  const change = at > 0 && before && current ? changeBetween(before, current) : null;
  // The call after this one, in the order the tree lists them.
  const order = visibleSpans(roots, new Set()).map((s) => s.stage.index);
  const next = order[order.indexOf(span.stage.index) + 1];

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100svh-6rem)]">
      <header aria-label="The run" className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate font-heading text-xl font-semibold tracking-tight">{trace.name}</h1>
          <span className="text-sm text-muted-foreground">
            {formatDate(report.run.started_at)} ·{" "}
            {audit ? plural(roots.length, "document") : plural(steps.length, "step")}
          </span>
        </div>
        <Figure label="Took">{formatSeconds(totals.seconds)}</Figure>
        <TimeSplit trace={trace} />
        {totals.tokensEmbedded !== null && (
          <Figure label="Tokens embedded">{formatCount(totals.tokensEmbedded)}</Figure>
        )}
        {(totals.usd !== null || totals.unpriced) && (
          <Figure label="Cost">{totals.usd !== null ? formatUsd(totals.usd) : "not priced"}</Figure>
        )}
        {totals.hosts.length > 0 && <Figure label="Sent to">{totals.hosts.join(", ")}</Figure>}
        {totals.identifiersSent !== null && totals.hosts.length > 0 && (
          <Figure label="Identifiers sent" tone={totals.identifiersSent > 0 ? "text-destructive" : "text-success"}>
            {formatCount(totals.identifiersSent)}
          </Figure>
        )}
        {!audit && <Figure label="Observing took">{formatSeconds(trace.overhead_seconds)}</Figure>}
        {!audit && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="ml-auto"
            value={view === "identifiers" ? "identifiers" : "trace"}
            onValueChange={(next) => next && setView(next === "trace" ? null : next)}
            aria-label="View"
          >
            <ToggleGroupItem value="trace">Trace</ToggleGroupItem>
            <ToggleGroupItem value="identifiers">Identifiers</ToggleGroupItem>
          </ToggleGroup>
        )}
      </header>

      {trace.error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>The pipeline raised {trace.error}</AlertTitle>
          <AlertDescription>The trace ends where it stopped.</AlertDescription>
        </Alert>
      )}

      {view === "identifiers" && !audit ? (
        <ValueTrail steps={steps} selected={at} />
      ) : (
        <div className="flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-xl border bg-card lg:min-h-0 lg:flex-row">
          <div className="flex max-h-80 min-h-0 flex-col border-b lg:max-h-none lg:w-[28rem] lg:shrink-0 lg:border-r lg:border-b-0">
            <SpanTree
              roots={roots}
              selected={span.stage.index}
              onSelect={(index) => setSpan(String(index))}
              total={traceSpan(trace)}
            />
          </div>
          <SpanDetail
            key={span.stage.index}
            span={span}
            total={traceSpan(trace)}
            from={at > 0 && before && span.stage.parent == null ? before.component : null}
            change={change}
            onNext={next === undefined ? null : () => setSpan(String(next))}
            document={documentOf(report, span)}
          />
        </div>
      )}
    </div>
  );
}
