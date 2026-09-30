import {
  BookOpenTextIcon,
  FolderIcon,
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
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import type { StepKind } from "@/report/traceView";

/**
 * How each kind of step is named and drawn: one colour each, on its icon and on its bar in
 * the waterfall, and nowhere else, so colour always means the kind of work.
 */
export const KIND: Record<StepKind, { label: string; icon: LucideIcon; tone: string; bar: string }> = {
  load: { label: "Load", icon: FileInputIcon, tone: "text-sky-500", bar: "bg-sky-500" },
  transform: { label: "Transform", icon: WandSparklesIcon, tone: "text-violet-500", bar: "bg-violet-500" },
  split: { label: "Split", icon: ScissorsIcon, tone: "text-amber-500", bar: "bg-amber-500" },
  embed: { label: "Embed", icon: SendIcon, tone: "text-emerald-500", bar: "bg-emerald-500" },
  custom: { label: "Your step", icon: CodeIcon, tone: "text-muted-foreground", bar: "bg-muted-foreground/60" },
  folder: { label: "Folder", icon: FolderIcon, tone: "text-muted-foreground", bar: "bg-muted-foreground/50" },
  document: { label: "Document", icon: FileTextIcon, tone: "text-sky-500", bar: "bg-sky-500" },
  read: { label: "Read", icon: BookOpenTextIcon, tone: "text-indigo-500", bar: "bg-indigo-500" },
  ocr: { label: "OCR", icon: ScanTextIcon, tone: "text-violet-500", bar: "bg-violet-500" },
  analyse: { label: "Analyse", icon: GaugeIcon, tone: "text-amber-500", bar: "bg-amber-500" },
  scan: { label: "Scan", icon: ShieldAlertIcon, tone: "text-rose-500", bar: "bg-rose-500" },
  verify: { label: "Vision", icon: EyeIcon, tone: "text-emerald-500", bar: "bg-emerald-500" },
  run: { label: "Run", icon: WorkflowIcon, tone: "text-foreground", bar: "bg-muted-foreground/45" },
};
