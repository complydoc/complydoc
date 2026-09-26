import {
  FileStackIcon,
  FileTextIcon,
  GaugeIcon,
  HouseIcon,
  ScissorsIcon,
  Settings2Icon,
  ShieldAlertIcon,
  type LucideIcon,
} from "lucide-react";

export const PAGES = ["home", "security", "cost", "documents", "loaders", "chunks", "settings"] as const;
export type Page = (typeof PAGES)[number];

/**
 * The pages about the report on screen, the same for every run. A page whose content
 * the run did not produce says so. Settings is about your setup, and sits apart from them.
 */
export const REPORT_PAGES = ["home", "security", "cost", "documents", "loaders", "chunks"] as const satisfies readonly Page[];

/** How each page is named and drawn in the navigation. */
export const PAGE_INFO: Record<Page, { label: string; icon: LucideIcon }> = {
  home: { label: "Home", icon: HouseIcon },
  security: { label: "Security", icon: ShieldAlertIcon },
  cost: { label: "Cost & time", icon: GaugeIcon },
  documents: { label: "Documents", icon: FileTextIcon },
  loaders: { label: "Loaders", icon: FileStackIcon },
  chunks: { label: "Chunks", icon: ScissorsIcon },
  settings: { label: "Settings", icon: Settings2Icon },
};
