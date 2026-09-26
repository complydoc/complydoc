import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { Report } from "@/report/types";
import { PAGE_INFO, REPORT_PAGES, type Page } from "./pages";

interface AppSidebarProps {
  /** The run on screen; null on the overview of every folder. */
  report: Report | null;
  page: Page;
  /** Which folder and run is on screen, and the way to open more. */
  switcher: ReactNode;
}

/** The navigation: which folder is open, and its pages. */
export function AppSidebar({ report, page, switcher }: AppSidebarProps) {
  const Settings = PAGE_INFO.settings.icon;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Collapsed, the mark sits in a square like the page buttons below it, centred and at their icons' size. */}
        <div className="flex h-8 items-center px-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:[&_svg]:h-auto group-data-[collapsible=icon]:[&_svg]:w-5">
          <Logo size={22} withName={false} />
          <span className="ml-2 text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">complydoc</span>
        </div>
        {switcher}
      </SidebarHeader>

      {report && (
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Report</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {REPORT_PAGES.map((id) => {
                  const { label, icon: Icon } = PAGE_INFO[id];
                  return (
                    <SidebarMenuItem key={id}>
                      <SidebarMenuButton asChild isActive={id === page} tooltip={label}>
                        <a href={`#${id}`} aria-current={id === page ? "page" : undefined}>
                          <Icon />
                          <span>{label}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      )}
      {report && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={page === "settings"} tooltip={PAGE_INFO.settings.label}>
                <a href="#settings" aria-current={page === "settings" ? "page" : undefined}>
                  <Settings />
                  <span>{PAGE_INFO.settings.label}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
