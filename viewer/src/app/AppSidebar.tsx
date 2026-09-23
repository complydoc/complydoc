import { FileJsonIcon, FolderOpenIcon } from "lucide-react";
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { Report } from "@/report/types";
import { PAGES, PAGE_INFO, type Page } from "./pages";

interface AppSidebarProps {
  report: Report;
  name: string;
  page: Page;
  onClose: () => void;
}

/** The report's navigation: which report is open, its pages, and the controls that are not about any one page. */
export function AppSidebar({ report, name, page, onClose }: AppSidebarProps) {
  const counts: Record<Page, number | undefined> = {
    summary: undefined,
    security: report.aggregate.sensitive_total,
    cost: report.cost?.models.length,
    documents: report.documents.length,
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Collapsed, the mark sits in a square like the page buttons below it, centred and at their icons' size. */}
        <div className="flex h-8 items-center px-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:[&_svg]:h-auto group-data-[collapsible=icon]:[&_svg]:w-5">
          <Logo size={22} withName={false} />
          <span className="ml-2 text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">complydoc</span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip={name} className="cursor-default hover:bg-transparent">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent">
                <FileJsonIcon className="size-4" />
              </span>
              <span className="grid min-w-0 text-left leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {report.documents.length} documents · {report.run.report_detail}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Report</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PAGES.map((id) => {
                const { label, icon: Icon } = PAGE_INFO[id];
                return (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton asChild isActive={id === page} tooltip={label}>
                      <a href={`#${id}`} aria-current={id === page ? "page" : undefined}>
                        <Icon />
                        <span>{label}</span>
                      </a>
                    </SidebarMenuButton>
                    {counts[id] !== undefined && <SidebarMenuBadge>{counts[id]}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onClose} tooltip="Open another report">
              <FolderOpenIcon />
              <span>Open another</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
