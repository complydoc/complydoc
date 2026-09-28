import { cn } from "@/lib/utils";
import { formatPercent, formatSeconds } from "@/report/format";
import { timeByKind } from "@/report/traceTree";
import type { Trace } from "@/report/traceTypes";
import { KIND } from "./kinds";

/** Kinds of work named beside the bar; the rest are in it, and in its tooltip. */
const NAMED = 3;

/** Where the run's time went, by kind of work, as one bar and the largest few named. */
export function TimeSplit({ trace }: { trace: Trace }) {
  const parts = timeByKind(trace).filter((part) => part.seconds > 0);
  if (parts.length < 2) return null;
  return (
    <div className="flex min-w-56 flex-col gap-1.5" role="group" aria-label="Where the time went">
      <span className="text-xs text-muted-foreground">Where the time went</span>
      <div className="flex h-2 w-56 overflow-hidden rounded-full bg-muted">
        {parts.map((part) => (
          <span
            key={part.kind}
            title={`${KIND[part.kind].label}: ${formatSeconds(part.seconds)}, ${formatPercent(part.share)}`}
            className={cn("h-full", KIND[part.kind].bar)}
            style={{ width: `${part.share * 100}%` }}
          />
        ))}
      </div>
      <span className="flex flex-wrap gap-x-3 text-xs tabular-nums">
        {parts.slice(0, NAMED).map((part) => (
          <span key={part.kind} className="flex items-center gap-1">
            <span className={cn("size-2 rounded-full", KIND[part.kind].bar)} />
            {KIND[part.kind].label} {formatPercent(part.share)}
          </span>
        ))}
      </span>
    </div>
  );
}
