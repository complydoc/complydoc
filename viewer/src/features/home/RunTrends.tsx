import { useContext } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { traceOf } from "@/report/auditTrace";
import { formatCount, formatSeconds, formatUsd } from "@/report/format";
import { measured } from "@/report/measured";
import { traceTotals } from "@/report/traceTree";

interface Point {
  id: string;
  when: string;
  started: string;
  seconds: number | null;
  usd: number | null;
  identifiers: number | null;
  warnings: number | null;
}

function short(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

interface Metric {
  key: "seconds" | "usd" | "identifiers" | "warnings";
  title: string;
  description: string;
  format: (value: number) => string;
  color: string;
}

/**
 * Each run of the folder or pipeline as a bar, oldest to newest, for what a run measured
 * the same way each time: how long it took, what it cost, the identifiers it let through,
 * and its warnings. The run on screen is the one in full colour.
 */
export function RunTrends() {
  const { runs, current, open } = useContext(FolderRunsContext);
  if (runs.length < 2) return null;
  const pipeline = runs.some((run) => run.report.trace && run.report.trace.kind !== "audit");
  const points: Point[] = [...runs]
    .sort((a, b) => a.report.run.started_at.localeCompare(b.report.run.started_at))
    .map((run) => {
      const trace = measured(run.report, "trace") ? traceOf(run.report) : null;
      const totals = trace && trace.kind !== "audit" ? traceTotals(trace) : null;
      const high = measured(run.report, "sensitive") ? (run.report.aggregate.sensitive_by_severity.high ?? 0) : null;
      return {
        id: run.id,
        when: short(run.report.run.started_at),
        started: run.report.run.started_at,
        seconds: totals?.seconds ?? run.report.run.duration_seconds ?? null,
        usd: totals?.usd ?? null,
        identifiers: totals ? (totals.hosts.length ? totals.identifiersSent : 0) : high,
        warnings: trace ? trace.stages.reduce((sum, s) => sum + (s.warnings?.length ?? 0), 0) : null,
      };
    });
  const metrics: Metric[] = [
    {
      key: "seconds",
      title: "Duration",
      description: "How long each run took",
      format: formatSeconds,
      color: "var(--chart-1)",
    },
    { key: "usd", title: "Cost", description: "What each run spent", format: formatUsd, color: "var(--chart-1)" },
    {
      key: "identifiers",
      title: pipeline ? "Identifiers sent" : "High-severity identifiers",
      description: pipeline ? "Identifiers in what each run sent away" : "Found in each run",
      format: formatCount,
      color: "var(--destructive)",
    },
    {
      key: "warnings",
      title: "Warnings",
      description: "What went wrong without an error",
      format: formatCount,
      color: "var(--warning)",
    },
  ];
  const shown = metrics.filter((metric) => points.some((point) => (point[metric.key] ?? 0) > 0));
  if (shown.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {shown.map((metric) => {
        const config = { [metric.key]: { label: metric.title, color: metric.color } } satisfies ChartConfig;
        return (
          <Card key={metric.key}>
            <CardHeader>
              <CardTitle>{metric.title}</CardTitle>
              <CardDescription>{metric.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={config} className="aspect-auto h-40 w-full">
                <BarChart data={points} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="when" tickLine={false} axisLine={false} minTickGap={24} fontSize={11} />
                  <YAxis
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickFormatter={(value: number) => metric.format(value)}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        formatter={(value) => (typeof value === "number" ? metric.format(value) : String(value))}
                      />
                    }
                  />
                  <Bar
                    dataKey={metric.key}
                    radius={3}
                    isAnimationActive={false}
                    className="cursor-pointer"
                    onClick={(point: { payload?: Point }) => point.payload && open(point.payload.id)}
                  >
                    {points.map((point) => (
                      <Cell
                        key={point.id}
                        fill={`var(--color-${metric.key})`}
                        fillOpacity={point.id === current ? 1 : 0.35}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
