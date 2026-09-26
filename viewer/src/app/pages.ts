import { FileTextIcon, GaugeIcon, HouseIcon, Settings2Icon, ShieldAlertIcon, type LucideIcon } from "lucide-react";

export const PAGES = ["home", "security", "cost", "documents", "settings"] as const;
export type Page = (typeof PAGES)[number];

/** The pages about the report on screen. Settings is about your setup, and sits apart from them. */
export const REPORT_PAGES = ["home", "security", "cost", "documents"] as const satisfies readonly Page[];

/** How each page is named and drawn in the navigation. */
export const PAGE_INFO: Record<Page, { label: string; icon: LucideIcon }> = {
  home: { label: "Home", icon: HouseIcon },
  security: { label: "Security", icon: ShieldAlertIcon },
  cost: { label: "Cost & time", icon: GaugeIcon },
  documents: { label: "Documents", icon: FileTextIcon },
  settings: { label: "Settings", icon: Settings2Icon },
};
