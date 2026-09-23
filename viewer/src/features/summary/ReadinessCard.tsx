import { ScoreRing } from "@/components/ScoreRing";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatScore } from "@/report/format";
import { bandCounts, type Tone } from "@/report/select";
import type { Report } from "@/report/types";

const SWATCH: Record<Tone, string> = {
  good: "bg-success",
  neutral: "bg-chart-2",
  warn: "bg-warning",
  bad: "bg-destructive",
};

/** The folder's score, the bands its documents fall in, and the factors behind it. */
export function ReadinessCard({ report }: { report: Report }) {
  const { overall } = report;
  const bands = bandCounts(report);

  return (
    <Card>
      <CardContent className="grid items-center gap-10 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-4">
          <ScoreRing score={formatScore(overall.score)} caption={overall.label ?? "not scored"} segments={bands} />
          <ul aria-label="Documents by band" className="flex gap-4 text-sm text-muted-foreground">
            {bands.map((band) => (
              <li key={band.key} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={cn("size-2.5 rounded-xs", SWATCH[band.tone])} />
                {band.label} <strong className="font-semibold text-foreground">{band.count}</strong>
              </li>
            ))}
          </ul>
        </div>

        <ul aria-label="Factors" className="flex flex-col gap-6">
          {overall.factors.map((factor) => (
            <li key={factor.key} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{factor.name}</span>
                <span className="text-xs text-faint">{Math.round(factor.weight * 100)}%</span>
                <span className="ml-auto font-semibold">{formatScore(factor.score)}</span>
              </div>
              <Progress value={factor.score ?? 0} aria-label={`${factor.name} score`} />
              <p className="text-sm text-muted-foreground">{factor.why}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
