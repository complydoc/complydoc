import { ReadinessChart } from "@/components/ReadinessChart";
import { formatScore } from "@/report/format";
import { bandCounts, bandTone } from "@/report/select";
import type { Report } from "@/report/types";

/** The folder's score, the bands its documents fall in, and the factors behind it, compact. */
export function ReadinessCard({ report, row = false }: { report: Report; row?: boolean }) {
  const { overall } = report;
  return (
    <div className={row ? "flex items-center gap-6" : "flex flex-col gap-6"}>
      <ReadinessChart
        score={formatScore(overall.score)}
        value={overall.score}
        tone={bandTone(overall.label)}
        caption={overall.label ?? "not scored"}
        bands={bandCounts(report)}
        small={row}
      />
      <ul aria-label="Factors" className="flex min-w-0 flex-1 flex-col gap-3">
        {overall.factors.map((factor) => (
          <li key={factor.key} className="flex flex-col gap-1.5" title={factor.why}>
            <span className="flex items-baseline gap-2 text-sm">
              <span className="font-medium">{factor.name}</span>
              <span className="text-xs text-muted-foreground">{Math.round(factor.weight * 100)}%</span>
              <span className="figure ml-auto text-sm">{formatScore(factor.score)}</span>
            </span>
            <span
              role="progressbar"
              aria-label={`${factor.name} score`}
              aria-valuenow={factor.score ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <span className="block h-full rounded-full bg-viz-blue" style={{ width: `${factor.score ?? 0}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
