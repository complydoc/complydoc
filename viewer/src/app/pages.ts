import { FileTextIcon, GaugeIcon, LayoutDashboardIcon, ShieldAlertIcon, type LucideIcon } from "lucide-react";

export const PAGES = ["summary", "security", "cost", "documents"] as const;
export type Page = (typeof PAGES)[number];

/** How each page is named and drawn in the navigation. */
export const PAGE_INFO: Record<Page, { label: string; icon: LucideIcon }> = {
  summary: { label: "Summary", icon: LayoutDashboardIcon },
  security: { label: "Security", icon: ShieldAlertIcon },
  cost: { label: "Cost & time", icon: GaugeIcon },
  documents: { label: "Documents", icon: FileTextIcon },
};
