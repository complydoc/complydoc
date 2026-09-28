import { CodeIcon, FileInputIcon, ScissorsIcon, SendIcon, WandSparklesIcon, type LucideIcon } from "lucide-react";
import type { StepKind } from "@/report/traceView";

/**
 * How each kind of step is named and drawn: one quiet colour each, on its icon and on the
 * pill that names it, so a tree of calls reads at a glance.
 */
export const KIND: Record<StepKind, { label: string; icon: LucideIcon; tone: string; pill: string }> = {
  load: {
    label: "Load",
    icon: FileInputIcon,
    tone: "text-sky-500",
    pill: "bg-sky-500/12 text-sky-600 ring-sky-500/30 dark:text-sky-400",
  },
  transform: {
    label: "Transform",
    icon: WandSparklesIcon,
    tone: "text-violet-500",
    pill: "bg-violet-500/12 text-violet-600 ring-violet-500/30 dark:text-violet-400",
  },
  split: {
    label: "Split",
    icon: ScissorsIcon,
    tone: "text-amber-500",
    pill: "bg-amber-500/12 text-amber-600 ring-amber-500/30 dark:text-amber-400",
  },
  embed: {
    label: "Embed",
    icon: SendIcon,
    tone: "text-emerald-500",
    pill: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  },
  custom: {
    label: "Your step",
    icon: CodeIcon,
    tone: "text-muted-foreground",
    pill: "bg-muted text-muted-foreground ring-border",
  },
};

/** How a call's time reads against the whole run: most of it red, a good part amber, the rest green. */
export function durationTone(seconds: number, total: number): string {
  const share = seconds / total;
  if (share >= 0.4) return "bg-destructive/10 text-destructive ring-destructive/30";
  if (share >= 0.15) return "bg-warning/10 text-warning ring-warning/30";
  return "bg-success/10 text-success ring-success/30";
}
