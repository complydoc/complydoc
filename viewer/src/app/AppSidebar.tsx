import { BookOpenIcon, ChevronRightIcon } from "lucide-react";
import { useContext, useState, type ReactNode } from "react";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { cn } from "@/lib/utils";
import { guideFor } from "@/report/docs";
import { formatCount } from "@/report/format";
import { measured } from "@/report/measured";
import type { Report } from "@/report/types";
import { PAGE_CONTENT, PAGE_INFO, type Page } from "./pages";

interface AppSidebarProps {
  /** The run on screen; null on the overview of every folder. */
  report: Report | null;
  page: Page;
  /** Which folder and run is on screen, and the way to open more. */
  switcher: ReactNode;
  /** The way to jump to any page, document or run. */
  search?: ReactNode;
}

/** The report's pages, grouped by what they are for. */
const GROUPS: { label: string; pages: Page[] }[] = [
  { label: "Overview", pages: ["home", "pipeline"] },
  { label: "Findings", pages: ["security", "documents"] },
  { label: "Ingestion", pages: ["chunks", "loaders", "cost"] },
];

const FOLDED_KEY = "complydoc-sidebar-missing-open";

/** A figure beside a page's name, where it says something at a glance. */
function countFor(report: Report, page: Page): string | null {
  switch (page) {
    case "security": {
      if (!measured(report, "sensitive")) return null;
      const high = report.aggregate.sensitive_by_severity.high ?? 0;
      return high > 0 ? formatCount(high) : null;
    }
    case "documents":
      return report.documents.length > 0 ? formatCount(report.documents.length) : null;
    case "chunks":
      return report.chunks?.length ? formatCount(report.chunks.length) : null;
    case "pipeline":
      // An audit's trace is its documents, counted beside Documents already.
      return report.trace ? formatCount(report.trace.stages.filter((s) => s.parent == null).length) : null;
    default:
      return null;
  }
}

function PageLink({
  id,
  page,
  count = null,
  muted = false,
}: {
  id: Page;
  page: Page;
  count?: string | null;
  muted?: boolean;
}) {
  const { label, icon: Icon } = PAGE_INFO[id];
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={id === page}
        tooltip={muted ? `${label}: not in this run` : label}
        className={cn(muted && "text-muted-foreground")}
      >
        <a
          href={`#${id}`}
          aria-current={id === page ? "page" : undefined}
          aria-description={muted ? "Not in this run" : undefined}
          title={muted ? "Not in this run" : undefined}
        >
          <Icon />
          <span>{label}</span>
        </a>
      </SidebarMenuButton>
      {count && <SidebarMenuBadge className="text-muted-foreground">{count}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}

function readFolded(): boolean {
  try {
    return localStorage.getItem(FOLDED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The navigation: which folder and run is open, a way to anything in it, and its pages
 * grouped by what they are for, each with a figure where one says something. Pages the
 * run has nothing for wait, folded, at the end, to say what would fill them.
 */
export function AppSidebar({ report, page, switcher, search }: AppSidebarProps) {
  const { runs } = useContext(FolderRunsContext);
  const [missingOpen, setMissingOpen] = useState(readFolded);
  const toggleMissing = () => {
    const next = !missingOpen;
    setMissingOpen(next);
    try {
      localStorage.setItem(FOLDED_KEY, next ? "1" : "0");
    } catch {
      // Storage can be blocked; the group still opens for this visit.
    }
  };
  const has = (id: Page) => {
    const content = PAGE_CONTENT[id];
    return !report || content === undefined || measured(report, content);
  };
  const missing = report ? GROUPS.flatMap((group) => group.pages).filter((id) => !has(id)) : [];
  const Runs = PAGE_INFO.runs.icon;
  const Settings = PAGE_INFO.settings.icon;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        {/* Collapsed, the mark sits in a square like the page buttons below it, centred and at their icons' size. */}
        <div className="flex h-8 items-center px-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:[&_svg]:h-auto group-data-[collapsible=icon]:[&_svg]:w-5">
          <Logo size={22} withName={false} />
          <span className="ml-2 text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            complydoc
          </span>
        </div>
        {switcher}
        {search}
      </SidebarHeader>

      {report && (
        <SidebarContent>
          {GROUPS.map((group) => {
            const pages = group.pages.filter(has);
            if (pages.length === 0) return null;
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {pages.map((id) => (
                      <PageLink key={id} id={id} page={page} count={countFor(report, id)} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
          {missing.length > 0 && (
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel asChild>
                <button
                  type="button"
                  onClick={toggleMissing}
                  aria-expanded={missingOpen}
                  className="flex w-full items-center gap-1.5 hover:text-sidebar-foreground"
                >
                  Not in this run
                  <span className="text-muted-foreground/70 tabular-nums">{missing.length}</span>
                  <ChevronRightIcon
                    className={cn("ml-auto size-3.5 transition-transform", missingOpen && "rotate-90")}
                  />
                </button>
              </SidebarGroupLabel>
              {(missingOpen || missing.includes(page)) && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {missing.map((id) => (
                      <PageLink key={id} id={id} page={page} muted />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          )}
        </SidebarContent>
      )}
      {report && (
        <SidebarFooter>
          <SidebarSeparator className="mx-0" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={page === "runs"} tooltip={PAGE_INFO.runs.label}>
                <a href="#runs" aria-current={page === "runs" ? "page" : undefined}>
                  <Runs />
                  <span>{PAGE_INFO.runs.label}</span>
                </a>
              </SidebarMenuButton>
              {runs.length > 1 && (
                <SidebarMenuBadge className="text-muted-foreground">{formatCount(runs.length)}</SidebarMenuBadge>
              )}
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={page === "settings"} tooltip={PAGE_INFO.settings.label}>
                <a href="#settings" aria-current={page === "settings" ? "page" : undefined}>
                  <Settings />
                  <span>{PAGE_INFO.settings.label}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Documentation">
                <a href={guideFor(page)} target="_blank" rel="noreferrer">
                  <BookOpenIcon />
                  <span>Documentation</span>
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
