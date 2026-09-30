import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KIND } from "@/features/pipeline/kinds";
import { cn } from "@/lib/utils";
import { runLabel, type Loaded } from "@/report/collections";
import { formatCount, formatSeconds, formatUsd } from "@/report/format";
import { pairSteps, runFigures, type RunFigures } from "@/report/traceCompare";
import type { Step } from "@/report/traceView";

/** A figure's change from the older run to the newer, coloured by whether less is better. */
function Delta({ a, b, lower = true }: { a: number | null; b: number | null; lower?: boolean }) {
  if (a === null || b === null || a === b) return <span className="text-muted-foreground">–</span>;
  const better = lower ? b < a : b > a;
  const share = a === 0 ? null : (b - a) / a;
  return (
    <span className={better ? "text-success" : "text-destructive"}>
      {b > a ? "+" : "−"}
      {share === null ? formatCount(Math.abs(b - a)) : `${Math.round(Math.abs(share) * 100)}%`}
    </span>
  );
}

const FIGURES: { label: string; value: (f: RunFigures) => number | null; show: (v: number) => string }[] = [
  { label: "Took", value: (f) => f.seconds, show: formatSeconds },
  { label: "Items to the last step", value: (f) => f.passedOn, show: formatCount },
  { label: "Tokens embedded", value: (f) => f.tokens, show: formatCount },
  { label: "Cost", value: (f) => f.usd, show: formatUsd },
  { label: "Identifiers sent", value: (f) => f.identifiersSent, show: formatCount },
];

function value(setting: unknown): string {
  return typeof setting === "string" ? setting : JSON.stringify(setting);
}

function StepCell({
  step,
  changed,
  side,
}: {
  step: Step | null;
  changed: { name: string; a: unknown; b: unknown }[];
  side: "a" | "b";
}) {
  if (!step) return <span className="text-muted-foreground">not in this run</span>;
  const out = step.kind === "embed" ? step.vectors : step.documentsOut;
  return (
    <span className="flex flex-col gap-1">
      {changed.map((change) => (
        <code key={change.name} className="font-mono text-xs">
          {change.name}: <span className="font-medium text-foreground">{value(change[side])}</span>
        </code>
      ))}
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatSeconds(step.seconds)}
        {out !== null && ` · ${formatCount(out)} out`}
        {step.scanned !== "off" && ` · ${formatCount(step.identifiers.length)} identifiers`}
      </span>
    </span>
  );
}

/**
 * Two runs of one pipeline side by side: what each made and cost, then its steps lined up,
 * the settings that changed between them, and what each step made in each run.
 */
export function PipelineCompare({ older, newer }: { older: Loaded; newer: Loaded }) {
  const a = older.report.trace;
  const b = newer.report.trace;
  if (!a || !b) return null;
  const [fa, fb] = [runFigures(a), runFigures(b)];
  // Runs made minutes apart share a label to the minute, so the seconds tell them apart.
  const precise = runLabel(older.report) === runLabel(newer.report);
  const header = (run: Loaded, which: string): ReactNode => (
    <span className="flex flex-col font-normal">
      <span className="font-medium text-foreground">{which}</span>
      <span className="text-xs text-muted-foreground">{runLabel(run.report, precise)}</span>
    </span>
  );
  return (
    <div className="flex flex-col gap-4">
      <Table aria-label="The two runs">
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead className="h-auto py-2 text-right">{header(older, "Earlier")}</TableHead>
            <TableHead className="h-auto py-2 text-right">{header(newer, "Later")}</TableHead>
            <TableHead className="text-right">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {FIGURES.map((figure) => {
            const [x, y] = [figure.value(fa), figure.value(fb)];
            if (x === null && y === null) return null;
            return (
              <TableRow key={figure.label}>
                <TableCell className="text-muted-foreground">{figure.label}</TableCell>
                <TableCell className="text-right tabular-nums">{x === null ? "–" : figure.show(x)}</TableCell>
                <TableCell className="text-right tabular-nums">{y === null ? "–" : figure.show(y)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <Delta a={x} b={y} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Table aria-label="Steps compared">
        <TableHeader>
          <TableRow>
            <TableHead>Step</TableHead>
            <TableHead className="h-auto py-2">{header(older, "Earlier")}</TableHead>
            <TableHead className="h-auto py-2">{header(newer, "Later")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pairSteps(a, b).map((pair, index) => {
            const step = (pair.a ?? pair.b) as Step;
            const kind = KIND[step.kind];
            return (
              <TableRow key={index} className={cn(pair.changed.length > 0 && "bg-warning/5")}>
                <TableCell>
                  <span className="flex items-center gap-2" title={kind.label}>
                    <kind.icon className={cn("size-4 shrink-0", kind.tone)} aria-label={kind.label} />
                    <span className="font-medium">{step.component}</span>
                  </span>
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <StepCell step={pair.a} changed={pair.changed} side="a" />
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <StepCell step={pair.b} changed={pair.changed} side="b" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
