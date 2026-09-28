import {
  FileStackIcon,
  FileTextIcon,
  GaugeIcon,
  HistoryIcon,
  HouseIcon,
  ScissorsIcon,
  Settings2Icon,
  ShieldAlertIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import type { Content } from "@/report/measured";

export const PAGES = [
  "home",
  "pipeline",
  "security",
  "cost",
  "documents",
  "loaders",
  "chunks",
  "runs",
  "settings",
] as const;
export type Page = (typeof PAGES)[number];

/** What each report page shows, as `measured` names it; Home shows whatever the run has. */
export const PAGE_CONTENT: Partial<Record<Page, Content>> = {
  pipeline: "trace",
  security: "sensitive",
  cost: "cost",
  documents: "documents",
  loaders: "loaders",
  chunks: "chunks",
};

/** How each page is named and drawn in the navigation. */
export const PAGE_INFO: Record<Page, { label: string; icon: LucideIcon }> = {
  home: { label: "Home", icon: HouseIcon },
  pipeline: { label: "Trace", icon: WorkflowIcon },
  security: { label: "Security", icon: ShieldAlertIcon },
  cost: { label: "Cost & time", icon: GaugeIcon },
  documents: { label: "Documents", icon: FileTextIcon },
  loaders: { label: "Loaders", icon: FileStackIcon },
  chunks: { label: "Chunks", icon: ScissorsIcon },
  runs: { label: "Runs", icon: HistoryIcon },
  settings: { label: "Settings", icon: Settings2Icon },
};
