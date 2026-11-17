import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import type { Tone } from "@/report/select";
import { HUE_TEXT, type Hue } from "./hues";

interface StatProps {
  label: string;
  value: ReactNode;
  /** One short line under the figure. */
  note?: string | undefined;
  /** What the figure says, where it says something: its colour, and a tick on the panel's edge. */
  tone?: Tone;
  /** A small icon before the label, in one of the palette's hues: what the figure is about. */
  icon?: LucideIcon;
  hue?: Hue;
}


const FIGURE: Record<Tone, string> = { good: "text-success", neutral: "", warn: "text-warning", bad: "text-destructive" };

/** One headline figure, read off the run like a gauge: its name, the figure, a note. No box: a
 *  row of them is divided by hairlines, as a status bar is. */
export function Stat({ label, value, note, tone, icon: Icon, hue = "blue" }: StatProps) {
  return (
    <div
      data-slot="stat"
      className="flex min-w-0 flex-col gap-1.5 px-5 py-1 first:pl-0"
    >
      <span className="caps truncate">
        {Icon && (
          <Icon aria-hidden="true" className={cn("mr-1.5 inline size-3.5 align-[-3px]", HUE_TEXT[hue])} />
        )}
        {label}
      </span>
      <span
        className={cn(
          "figure truncate text-2xl leading-none font-medium",
          tone && FIGURE[tone],
        )}
      >
        {value}
      </span>
      {note && <span className="truncate text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

/** A row of stats, as many to a row as fit, whatever their number. */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-y-4 divide-x">{children}</div>
  );
}
