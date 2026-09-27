import { CodeIcon, FileInputIcon, ScissorsIcon, SendIcon, WandSparklesIcon, type LucideIcon } from "lucide-react";
import type { StepKind } from "@/report/traceView";

/** How each kind of step is named and drawn. */
export const KIND: Record<StepKind, { label: string; icon: LucideIcon }> = {
  load: { label: "Load", icon: FileInputIcon },
  transform: { label: "Transform", icon: WandSparklesIcon },
  split: { label: "Split", icon: ScissorsIcon },
  embed: { label: "Embed", icon: SendIcon },
  custom: { label: "Your step", icon: CodeIcon },
};
