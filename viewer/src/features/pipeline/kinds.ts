import {
  BookOpenTextIcon,
  FolderIcon,
  CodeIcon,
  DatabaseIcon,
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
  load: { label: "Load", icon: FileInputIcon, tone: "text-viz-blue", bar: "bg-viz-blue" },
  transform: { label: "Transform", icon: WandSparklesIcon, tone: "text-viz-violet", bar: "bg-viz-violet" },
  split: { label: "Split", icon: ScissorsIcon, tone: "text-viz-amber", bar: "bg-viz-amber" },
  embed: { label: "Embed", icon: SendIcon, tone: "text-viz-mint", bar: "bg-viz-mint" },
  store: { label: "Store", icon: DatabaseIcon, tone: "text-viz-mint", bar: "bg-viz-mint" },
  custom: { label: "Your step", icon: CodeIcon, tone: "text-muted-foreground", bar: "bg-muted-foreground/60" },
  folder: { label: "Folder", icon: FolderIcon, tone: "text-muted-foreground", bar: "bg-muted-foreground/50" },
  document: { label: "Document", icon: FileTextIcon, tone: "text-viz-blue", bar: "bg-viz-blue" },
  read: { label: "Read", icon: BookOpenTextIcon, tone: "text-viz-indigo", bar: "bg-viz-indigo" },
  ocr: { label: "OCR", icon: ScanTextIcon, tone: "text-viz-violet", bar: "bg-viz-violet" },
  analyse: { label: "Analyse", icon: GaugeIcon, tone: "text-viz-amber", bar: "bg-viz-amber" },
  scan: { label: "Scan", icon: ShieldAlertIcon, tone: "text-viz-coral", bar: "bg-viz-coral" },
  verify: { label: "Vision", icon: EyeIcon, tone: "text-viz-mint", bar: "bg-viz-mint" },
  run: { label: "Run", icon: WorkflowIcon, tone: "text-foreground", bar: "bg-muted-foreground/45" },
};
