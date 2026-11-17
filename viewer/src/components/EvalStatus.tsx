import { CircleCheckIcon, CircleDashedIcon, CircleXIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import type { Outcome } from "@/report/evals";

const LOOK: Record<Outcome, { word: string; icon: LucideIcon; tone: string }> = {
  kept: { word: "Pass", icon: CircleCheckIcon, tone: "text-success" },
  near: { word: "Near", icon: CircleDashedIcon, tone: "text-warning" },
  lost: { word: "Fail", icon: CircleXIcon, tone: "text-destructive" },
};

/** An eval's result: an icon carries the colour, the word beside it stays plain. */
export function EvalStatus({ outcome, className }: { outcome: Outcome; className?: string }) {
  const look = LOOK[outcome];
  return (
    <span data-outcome={outcome} className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <look.icon aria-hidden="true" className={cn("size-4 shrink-0", look.tone)} />
      {look.word}
    </span>
  );
}
