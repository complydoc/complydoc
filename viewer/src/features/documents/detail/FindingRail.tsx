import type { MarkTick, MarkTone } from "@/hooks/useInlineMarks";
import { cn } from "@/lib/utils";

const TICK: Record<MarkTone, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground/60",
  ignored: "bg-muted-foreground/30",
};

interface FindingRailProps {
  ticks: MarkTick[];
  active: string | null;
  onPick: (key: string) => void;
  label: (key: string) => string;
}

/**
 * A slim rail at the text's edge with a tick where each finding sits in the
 * whole text, coloured by severity: where the findings are, at a glance, and a
 * way to go to one. Drawn over the text's scroll bar, the way an editor draws
 * its overview ruler.
 */
export function FindingRail({ ticks, active, onPick, label }: FindingRailProps) {
  if (ticks.length === 0) return null;
  return (
    <div aria-label="Where the findings are" role="group" className="pointer-events-none absolute inset-y-1 right-1 w-2">
      {ticks.map((tick) => (
        <button
          key={`${tick.key}-${tick.at.toFixed(3)}`}
          type="button"
          aria-label={label(tick.key)}
          title={label(tick.key)}
          onClick={() => onPick(tick.key)}
          style={{ top: `${tick.at * 100}%` }}
          className={cn(
            "pointer-events-auto absolute right-0 h-1 w-2 -translate-y-1/2 rounded-full transition-[width]",
            TICK[tick.tone],
            active === tick.key ? "w-3.5 ring-2 ring-primary/60" : "hover:w-3",
          )}
        />
      ))}
    </div>
  );
}
