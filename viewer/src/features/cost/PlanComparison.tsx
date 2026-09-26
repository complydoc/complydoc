import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePlan } from "@/hooks/usePlan";
import { cn } from "@/lib/utils";
import { formatCount, formatPageUsd, formatSeconds } from "@/report/format";
import { Badge } from "@/components/ui/badge";
import { reportTotals, type Method, type Plan, type Totals } from "@/report/plan";
import type { Report } from "@/report/types";

/** A whole number from a box, within reason, or the fallback while it is being typed. */
function wholeNumber(value: string, fallback: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function projected(totals: Totals, documents: number, cores: number) {
  if (totals.documents === 0) return { usd: null, seconds: null };
  const scale = documents / totals.documents;
  return {
    usd: totals.usd === null ? null : totals.usd * scale,
    // Documents are read independently, so the work spreads over cores.
    seconds: totals.seconds === null ? null : (totals.seconds * scale) / cores,
  };
}

/** Which of the plan's models a way of reading sends pages to. */
function modelsFor(method: Method, plan: Plan): string {
  const text = plan.text?.name ?? "no priced model";
  const vision = plan.vision?.name ?? "no vision model";
  if (method === "vision") return vision;
  // One model for both is named once.
  if (method === "router") return text === vision ? text : `${text}, ${vision} for images`;
  return text;
}

interface Way {
  key: string;
  label: string;
  description: string;
  recommended: boolean;
  plan: Plan;
}

/**
 * Each method under the loaders chosen, and the method that reads files' own text
 * with each other loader the run compared, so loaders can be weighed on the same
 * table.
 */
function waysToRead(
  options: ReturnType<typeof usePlan>["options"],
  choices: ReturnType<typeof usePlan>["loaderChoices"],
  plan: Plan,
): Way[] {
  const ways: Way[] = options.map((option) => ({
    key: option.id,
    label: option.label,
    description: option.description,
    recommended: Boolean(option.recommended),
    plan: { ...plan, method: option.id },
  }));
  const withText = options.find((o) => o.id === "loader_ocr") ?? options.find((o) => o.id === "loader");
  if (!withText) return ways;
  for (const choice of choices) {
    const current = plan.loaders[choice.format] ?? choice.readers[0];
    for (const reader of choice.readers.filter((r) => r !== current)) {
      ways.push({
        key: `${withText.id}:${choice.format}:${reader}`,
        label: `${withText.label}, with ${reader} for ${choice.label}`,
        description: `As above, with ${reader} reading the ${choice.label} files' own text.`,
        recommended: false,
        plan: { ...plan, method: withText.id, loaders: { ...plan.loaders, [choice.format]: reader } },
      });
    }
  }
  return ways;
}

function samePlan(a: Plan, b: Plan): boolean {
  return (
    a.method === b.method &&
    JSON.stringify(Object.entries(a.loaders).sort()) === JSON.stringify(Object.entries(b.loaders).sort())
  );
}

/**
 * Every way this folder can be read, side by side: how much of it each reads,
 * what the result costs to send on, and how long the reading took, measured on
 * the machine that ran the audit and projected to a folder of any size.
 */
export function PlanComparison({ report }: { report: Report }) {
  const { plan, options, loaderChoices, chooseMethod, chooseLoader } = usePlan();
  const ways = waysToRead(options, loaderChoices, plan);
  const choose = (way: Way) => {
    chooseMethod(way.plan.method);
    for (const [format, reader] of Object.entries(way.plan.loaders)) chooseLoader(format, reader);
  };
  const [volume, setVolume] = useState("10000");
  const [cores, setCores] = useState(String(Math.max(1, navigator.hardwareConcurrency || 8)));
  const documents = wholeNumber(volume, 10_000, 100_000_000);
  const workers = wholeNumber(cores, 1, 1024);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <span>Projected to</span>
        <Input
          type="number"
          min={1}
          value={volume}
          onChange={(event) => setVolume(event.target.value)}
          aria-label="Documents to project to"
          className="h-8 w-28 tabular-nums"
        />
        <span>documents, on</span>
        <Input
          type="number"
          min={1}
          value={cores}
          onChange={(event) => setCores(event.target.value)}
          aria-label="Cores to read on"
          className="h-8 w-20 tabular-nums"
        />
        <span>cores</span>
      </div>
      <Card className="py-0">
        <Table>
          <TableCaption className="sr-only">Ways to read this folder</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Read with</TableHead>
              <TableHead className="text-right">Pages read</TableHead>
              <TableHead className="text-right">Cost here</TableHead>
              <TableHead className="text-right">Time here</TableHead>
              <TableHead className="text-right">Cost for {formatCount(documents)}</TableHead>
              <TableHead className="pr-4 text-right">Time for {formatCount(documents)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ways.map((way) => {
              const totals = reportTotals(report, way.plan);
              const scaled = projected(totals, documents, workers);
              const chosen = samePlan(way.plan, plan);
              const untimed = totals.untimed > 0 ? ` (${formatCount(totals.untimed)} pages not timed)` : "";
              return (
                <TableRow
                  key={way.key}
                  data-state={chosen ? "selected" : undefined}
                  onClick={() => choose(way)}
                  className="cursor-pointer"
                >
                  <TableCell className="pl-4">
                    <span className="flex items-center gap-2 font-medium">
                      <CheckIcon className={cn("size-4 text-primary", !chosen && "invisible")} />
                      {way.label}
                      {way.recommended && <Badge variant="secondary">Recommended</Badge>}
                    </span>
                    <span className="block pl-6 text-xs whitespace-normal text-muted-foreground">
                      {way.description}
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn("text-right tabular-nums", totals.pagesRead < totals.pages && "text-warning")}
                  >
                    {formatCount(totals.pagesRead)} of {formatCount(totals.pages)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPageUsd(totals.usd)}
                    <span className="block text-xs whitespace-normal text-muted-foreground">
                      on {modelsFor(way.plan.method, plan)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums" title={untimed || undefined}>
                    {totals.seconds === null ? (
                      <span className="text-muted-foreground">not timed</span>
                    ) : (
                      `${totals.averaged ? "~" : ""}${formatSeconds(totals.seconds)}${untimed ? "+" : ""}`
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPageUsd(scaled.usd)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">
                    {scaled.seconds === null ? "–" : formatSeconds(scaled.seconds)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-pretty text-muted-foreground">
        Time is how long reading took on the machine that ran the audit, not how long a model takes to answer. A vision
        model&apos;s time is only shown where a --verify run timed real calls; &ldquo;+&rdquo; means some pages were not
        timed, and &ldquo;~&rdquo; a loader&apos;s total spread over its pages. Choose a row to price the rest of the
        report that way.
      </p>
    </div>
  );
}
