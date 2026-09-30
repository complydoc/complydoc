import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHashParam } from "@/hooks/useHashRoute";
import { cn } from "@/lib/utils";
import { formatCount, formatSeconds, formatUsd, plural } from "@/report/format";
import { formatStarted } from "./started";
import { sameDocument } from "@/report/chunkPlaces";
import { spansOf, traceSpan, traceTotals, visibleSpans, type Span } from "@/report/traceTree";
import { changeBetween, stepsOf } from "@/report/traceView";
import type { Trace } from "@/report/traceTypes";
import type { Report } from "@/report/types";
import { DocumentJourney } from "./DocumentJourney";
import { SpanDetail } from "./SpanDetail";
import { ValueTrail } from "./ValueTrail";
import { Waterfall } from "./Waterfall";

/** One of the run's figures in the strip across the top: a label over its value. */
function Figure({ label, children, tone }: { label: string; children: ReactNode; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col px-4 first:pl-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm font-medium whitespace-nowrap tabular-nums", tone)}>{children}</dd>
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
 * One run as a trace: every call the pipeline made, the calls made inside each, when each
 * ran and for how long; the call picked, with what it passed on and how it was set; and the
 * run's totals above. The second view follows each identifier through the steps.
 */
export function RunTrace({ report, trace }: { report: Report; trace: Trace }) {
  const [spanParam, setSpan] = useHashParam("span");
  const [view, setView] = useHashParam("view");

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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div role="group" aria-label="The run" className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate font-heading text-lg leading-tight font-semibold tracking-tight">{trace.name}</h2>
          <span className="text-xs text-muted-foreground">
            {formatStarted(report.run.started_at)} ·{" "}
            {audit ? plural(report.documents.length, "document") : plural(steps.length, "step")}
          </span>
        </div>
        <dl className="flex flex-wrap divide-x">
          <Figure label="Duration">
            {formatSeconds(totals.seconds)}
            {!audit && trace.overhead_seconds > 0 && (
              <span
                className="ml-1.5 text-xs font-normal text-muted-foreground"
                title="What complydoc spent afterwards, auditing what the run read"
              >
                + {formatSeconds(trace.overhead_seconds)} observing
              </span>
            )}
          </Figure>
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
        </dl>
        {!audit && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="ml-auto"
            value={view === "identifiers" || view === "documents" ? view : "trace"}
            onValueChange={(next) => next && setView(next === "trace" ? null : next)}
            aria-label="View"
          >
            <ToggleGroupItem value="trace">Trace</ToggleGroupItem>
            <ToggleGroupItem value="documents">Documents</ToggleGroupItem>
            <ToggleGroupItem value="identifiers">Identifiers</ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {trace.error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>The pipeline raised {trace.error}</AlertTitle>
          <AlertDescription>The trace ends where it stopped.</AlertDescription>
        </Alert>
      )}

      {view === "identifiers" && !audit ? (
        <ValueTrail steps={steps} selected={at} />
      ) : view === "documents" && !audit ? (
        <DocumentJourney
          trace={trace}
          report={report}
          onStep={(index) => {
            setView(null);
            setSpan(String(index));
          }}
        />
      ) : (
        <div className="flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-xl border bg-card lg:min-h-0 lg:flex-row">
          <div className="flex max-h-96 min-h-0 flex-col border-b lg:max-h-none lg:w-[54%] lg:shrink-0 lg:border-r lg:border-b-0">
            <Waterfall
              roots={roots}
              selected={span.stage.index}
              onSelect={(index) => setSpan(String(index))}
              total={traceSpan(trace)}
            />
          </div>
          <SpanDetail
            key={span.stage.index}
            span={span}
            from={at > 0 && before && span.stage.parent == null ? before.component : null}
            change={change}
            onNext={next === undefined ? null : () => setSpan(String(next))}
            document={documentOf(report, span)}
            chunks={
              span.stage.chunks !== null && span.stage.chunks !== undefined
                ? (report.chunks?.[span.stage.chunks] ?? null)
                : null
            }
          />
        </div>
      )}
    </div>
  );
}
