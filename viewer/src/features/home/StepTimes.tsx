import { KIND } from "@/features/pipeline/kinds";
import { cn } from "@/lib/utils";
import { formatPercent, formatSeconds, plural } from "@/report/format";
import { stepRows } from "@/report/stepTimes";
import type { Report } from "@/report/types";

/** Steps shown before the rest are summed into one line. */
const SHOWN = 8;

/**
 * Where the run's time went, step by step: one bar across the whole run in each step's
 * colour, then each step with its time and share, the slowest first.
 */
export function StepTimes({ report }: { report: Report }) {
  const rows = stepRows(report);
  const total = rows.reduce((sum, row) => sum + row.seconds, 0);
  if (rows.length === 0 || total <= 0) return null;
  const ranked = [...rows].sort((a, b) => b.seconds - a.seconds);
  const shown = ranked.slice(0, SHOWN);
  const slowest = ranked[0]?.seconds || total;
  const rest = ranked.slice(SHOWN).reduce((sum, row) => sum + row.seconds, 0);
  const overhead = report.trace?.kind !== "audit" ? (report.trace?.overhead_seconds ?? 0) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {rows.map((row, index) => (
          <span
            key={`${row.name}-${index}`}
            className={cn("h-full", KIND[row.kind].bar)}
            style={{ width: `${(row.seconds / total) * 100}%` }}
            title={`${row.name}: ${formatSeconds(row.seconds)}`}
          />
        ))}
      </div>
      <ul aria-label="Time by step" className="flex flex-col gap-2">
        {shown.map((row, index) => {
          const kind = KIND[row.kind];
          return (
            <li
              key={`${row.name}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_7rem_4rem_3rem] items-center gap-3"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <kind.icon className={cn("size-3.5 shrink-0", kind.tone)} aria-label={kind.label} />
                <span className="truncate">{row.name}</span>
                {row.detail && <span className="shrink-0 text-xs text-muted-foreground">{row.detail}</span>}
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("block h-full rounded-full", kind.bar)}
                  style={{ width: `${(row.seconds / slowest) * 100}%` }}
                />
              </span>
              <span className="text-right font-mono text-xs tabular-nums">{formatSeconds(row.seconds)}</span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {formatPercent(row.seconds / total)}
              </span>
            </li>
          );
        })}
      </ul>
      {(rest > 0 || overhead > 0) && (
        <p className="text-xs text-muted-foreground">
          {rest > 0 && `${formatSeconds(rest)} in ${plural(ranked.length - SHOWN, "other step")}. `}
          {overhead > 0 && `Observing took ${formatSeconds(overhead)} more, after the run.`}
        </p>
      )}
    </div>
  );
}
