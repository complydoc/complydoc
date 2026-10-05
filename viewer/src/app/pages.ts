import {
  FileTextIcon,
  GaugeIcon,
  LayoutDashboardIcon,
  ScissorsIcon,
  Settings2Icon,
  ShieldAlertIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import type { Content } from "@/report/measured";

export const PAGES = ["home", "pipeline", "security", "cost", "documents", "chunks", "settings"] as const;
export type Page = (typeof PAGES)[number];

/** What each report page shows, as `measured` names it; Home shows whatever the run has. */
export const PAGE_CONTENT: Partial<Record<Page, Content>> = {
  pipeline: "trace",
  security: "sensitive",
  cost: "cost",
  documents: "documents",
  chunks: "chunks",
};

/** How each page is named and drawn in the navigation. */
export const PAGE_INFO: Record<Page, { label: string; icon: LucideIcon }> = {
  home: { label: "Dashboard", icon: LayoutDashboardIcon },
  pipeline: { label: "Traces", icon: WorkflowIcon },
  security: { label: "Security", icon: ShieldAlertIcon },
  cost: { label: "Cost & time", icon: GaugeIcon },
  documents: { label: "Documents", icon: FileTextIcon },
  chunks: { label: "Chunks", icon: ScissorsIcon },
  settings: { label: "Settings", icon: Settings2Icon },
};

/** The key that, after G, opens each page, the way Linear moves between its views. */
export const GO_KEY: Record<Page, string> = {
  home: "D",
  pipeline: "T",
  security: "S",
  cost: "M",
  documents: "F",
  chunks: "C",
  settings: ",",
};
