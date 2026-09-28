import {
  BookOpenTextIcon,
  CodeIcon,
  EyeIcon,
  FileInputIcon,
  FileTextIcon,
  GaugeIcon,
  ScanTextIcon,
  ScissorsIcon,
  SendIcon,
  ShieldAlertIcon,
  WandSparklesIcon,
  type LucideIcon,
} from "lucide-react";
import type { StepKind } from "@/report/traceView";

/**
 * How each kind of step is named and drawn: one quiet colour each, on its icon and on the
 * pill that names it, so a tree of calls reads at a glance.
 */
export const KIND: Record<StepKind, { label: string; icon: LucideIcon; tone: string; pill: string; bar: string }> = {
  load: {
    bar: "bg-sky-500",
    label: "Load",
    icon: FileInputIcon,
    tone: "text-sky-500",
    pill: "bg-sky-500/12 text-sky-600 ring-sky-500/30 dark:text-sky-400",
  },
  transform: {
    bar: "bg-violet-500",
    label: "Transform",
    icon: WandSparklesIcon,
    tone: "text-violet-500",
    pill: "bg-violet-500/12 text-violet-600 ring-violet-500/30 dark:text-violet-400",
  },
  split: {
    bar: "bg-amber-500",
    label: "Split",
    icon: ScissorsIcon,
    tone: "text-amber-500",
    pill: "bg-amber-500/12 text-amber-600 ring-amber-500/30 dark:text-amber-400",
  },
  embed: {
    bar: "bg-emerald-500",
    label: "Embed",
    icon: SendIcon,
    tone: "text-emerald-500",
    pill: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  },
  custom: {
    bar: "bg-muted-foreground/60",
    label: "Your step",
    icon: CodeIcon,
    tone: "text-muted-foreground",
    pill: "bg-muted text-muted-foreground ring-border",
  },
  document: {
    bar: "bg-sky-500",
    label: "Document",
    icon: FileTextIcon,
    tone: "text-sky-500",
    pill: "bg-sky-500/12 text-sky-600 ring-sky-500/30 dark:text-sky-400",
  },
  read: {
    bar: "bg-indigo-500",
    label: "Read",
    icon: BookOpenTextIcon,
    tone: "text-indigo-500",
    pill: "bg-indigo-500/12 text-indigo-600 ring-indigo-500/30 dark:text-indigo-400",
  },
  ocr: {
    bar: "bg-violet-500",
    label: "OCR",
    icon: ScanTextIcon,
    tone: "text-violet-500",
    pill: "bg-violet-500/12 text-violet-600 ring-violet-500/30 dark:text-violet-400",
  },
  analyse: {
    bar: "bg-amber-500",
    label: "Analyse",
    icon: GaugeIcon,
    tone: "text-amber-500",
    pill: "bg-amber-500/12 text-amber-600 ring-amber-500/30 dark:text-amber-400",
  },
  scan: {
    bar: "bg-rose-500",
    label: "Scan",
    icon: ShieldAlertIcon,
    tone: "text-rose-500",
    pill: "bg-rose-500/12 text-rose-600 ring-rose-500/30 dark:text-rose-400",
  },
  verify: {
    bar: "bg-emerald-500",
    label: "Vision",
    icon: EyeIcon,
    tone: "text-emerald-500",
    pill: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  },
};

/** How a call's time reads against the whole run: most of it red, a good part amber, the rest green. */
export function durationTone(seconds: number, total: number): string {
  const share = seconds / total;
  if (share >= 0.4) return "bg-destructive/10 text-destructive ring-destructive/30";
  if (share >= 0.15) return "bg-warning/10 text-warning ring-warning/30";
  return "bg-success/10 text-success ring-success/30";
}
