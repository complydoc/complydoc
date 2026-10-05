import { useCallback, useEffect, useState } from "react";
import { measured } from "@/report/measured";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ChunksPage } from "@/features/chunks/ChunksPage";
import { CostPage } from "@/features/cost/CostPage";
import { DocumentsPage } from "@/features/documents/DocumentsPage";
import { PipelinePage } from "@/features/pipeline/PipelinePage";
import { ReviewQueue } from "@/features/security/ReviewQueue";
import { SecurityPage } from "@/features/security/SecurityPage";
import { HomePage } from "@/features/home/HomePage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { useHashRoute } from "@/hooks/useHashRoute";
import { ModeToggle } from "@/components/ModeToggle";
import { PlanBar } from "@/components/PlanBar";
import { PlanProvider } from "@/components/PlanProvider";
import { IgnoreProvider } from "@/components/IgnoreProvider";
import { GoTo } from "@/components/GoTo";
import { Hint } from "@/components/Hint";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { useGoKeys } from "@/hooks/useGoKeys";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { cn } from "@/lib/utils";
import { CollectionSwitcher, type Selection } from "@/components/CollectionSwitcher";
import { OverviewPage } from "@/features/collections/OverviewPage";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { leadRun, type Collection, type Loaded } from "@/report/collections";
import { fileName } from "@/report/format";
import { AppSidebar } from "./AppSidebar";
import { PAGES, PAGE_INFO, type Page } from "./pages";
import { shortcut } from "@/lib/shortcut";

function leadIdOf(collection: Collection | undefined): string | null {
  return collection ? (leadRun(collection)?.id ?? null) : null;
}

interface ReportViewProps {
  collections: Collection[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onAdd: (files: File[]) => void;
  onCloseAll: () => void;
  /** Whether the dark theme is showing, and how to switch. */
  dark: boolean;
  onToggleTheme: () => void;
}

/** The run a selection points at. */
function selected(collections: Collection[], selection: Selection): Loaded | null {
  const collection = collections.find((c) => c.id === selection.collection);
  if (!collection) return null;
  return collection.runs.find((r) => r.id === selection.run) ?? collection.runs[0] ?? null;
}

const SIDEBAR_KEY = "complydoc.sidebar";

function rememberedSidebar(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) !== "closed";
  } catch {
    return true;
  }
}

/** The pages whose figures the loading plan prices, and so the only ones that show it. */
const PRICED: readonly Page[] = ["home", "documents", "cost"];

/**
 * The open reports: the sidebar, a bar saying where you are, and the page. With
 * a folder chosen, that folder's run; otherwise every folder side by side.
 */
export function ReportView({
  collections,
  selection,
  onSelect,
  onAdd,
  onCloseAll,
  dark,
  onToggleTheme,
}: ReportViewProps) {
  const [{ page, detail }] = useHashRoute(PAGES);
  const opened = selected(collections, selection);
  // A run opens on its traces, as tracing tools open: the calls, or every run to pick from.
  // A run with neither opens on its dashboard.
  useEffect(() => {
    if (!opened || window.location.hash) return;
    const runs = collections.find((c) => c.id === selection.collection)?.runs.length ?? 0;
    const traced = measured(opened.report, "trace");
    window.location.replace(traced || runs > 1 ? "#pipeline" : "#home");
  }, [opened, collections, selection.collection]);
  // G then a key opens a page; ? lists every shortcut.
  const [shortcuts, setShortcuts] = useState(false);
  useGoKeys(
    useCallback(() => setShortcuts(true), []),
    opened !== null,
  );
  // The sidebar stays as it was left: opening another run or folder remounts what is under it.
  const [sidebarOpen, setSidebarOpen] = useState(rememberedSidebar);
  const sidebar = {
    open: sidebarOpen,
    onOpenChange: (open: boolean) => {
      setSidebarOpen(open);
      try {
        window.localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed");
      } catch {
        // It opens expanded next time.
      }
    },
  };
  // Each page, and each document, opens at its top, not where the last one was left.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, detail]);
  const run = selected(collections, selection);
  const switcher = (
    <CollectionSwitcher
      collections={collections}
      selection={selection}
      onSelect={onSelect}
      onAdd={onAdd}
      onCloseAll={onCloseAll}
    />
  );

  if (!run) {
    return (
      <SidebarProvider {...sidebar}>
        <AppSidebar report={null} page={page} switcher={switcher} />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <Hint label="Collapse or expand the sidebar" keys={[shortcut("").trim(), "B"]}>
              <SidebarTrigger className="-ml-1" />
            </Hint>
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>All folders</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ModeToggle dark={dark} onToggle={onToggleTheme} />
            </div>
          </header>
          <main className="mx-auto w-full max-w-none p-4 md:p-6">
            <PageErrorBoundary>
              <OverviewPage
                collections={collections}
                onOpen={(id) => onSelect({ collection: id, run: leadIdOf(collections.find((c) => c.id === id)) })}
              />
            </PageErrorBoundary>
          </main>
        </SidebarInset>
        <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      </SidebarProvider>
    );
  }

  const report = run.report;
  const name = collections.find((c) => c.id === selection.collection)?.name ?? run.name;
  const open = page === "documents" && detail !== null ? report.documents[Number(detail.split("/")[0])] : undefined;

  return (
    // A fresh plan for each run: the models it lists are its own.
    <PlanProvider key={run.id} report={report}>
      <FolderRunsContext.Provider
        value={{
          runs: collections.find((c) => c.id === selection.collection)?.runs ?? [],
          current: run.id,
          open: (id) => onSelect({ collection: selection.collection, run: id }),
        }}
      >
        <SidebarProvider {...sidebar}>
          <AppSidebar report={report} page={page} switcher={switcher} search={<GoTo report={report} />} />
          {/* min-w-0 lets the page shrink to the space beside the sidebar instead of widening to its widest chart. */}
          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
              <Hint label="Collapse or expand the sidebar" keys={[shortcut("").trim(), "B"]}>
                <SidebarTrigger className="-ml-1" />
              </Hint>
              <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
              {/* One line that gives way to the plan controls: it truncates rather than wraps under the bar. */}
              <Breadcrumb className="min-w-0 flex-1">
                <BreadcrumbList className="flex-nowrap overflow-hidden whitespace-nowrap [&>li]:min-w-0 [&>li]:truncate">
                  <BreadcrumbItem className="hidden xl:block">{name}</BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden xl:block" />
                  <BreadcrumbItem>
                    {open ? (
                      <BreadcrumbLink href={`#${page}`}>{PAGE_INFO[page].label}</BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{PAGE_INFO[page].label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {open && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{fileName(open.relative_path)}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
              {/* The plan's pickers give up width before the page scrolls sideways. */}
              <div className="ml-auto flex min-w-0 items-center gap-2">
                {PRICED.includes(page) && <PlanBar />}
                <ModeToggle dark={dark} onToggle={onToggleTheme} />
              </div>
            </header>
            <main
              className={cn(
                "mx-auto w-full",
                // The trace takes the window: most of what it shows is the trace itself.
                "p-4 md:p-6",
                page === "documents" || page === "pipeline" ? "max-w-none" : "max-w-7xl",
              )}
            >
              {/* Keyed by page and run, so moving on from a page that failed shows the next one. */}
              <PageErrorBoundary key={`${run.id}:${page}:${detail ?? ""}`}>
                <IgnoreProvider report={report} {...(run.source ? { source: run.source } : {})}>
                  {/* Remounted with the page by the boundary's key, so each page fades in. */}
                  <div className="animate-page-in">
                    {page === "home" && <HomePage report={report} />}
                    {page === "pipeline" && <PipelinePage report={report} />}
                    {page === "security" &&
                      (detail?.startsWith("review") ? (
                        <ReviewQueue report={report} at={Number(detail.split("/")[1] ?? 0) || 0} />
                      ) : (
                        <SecurityPage report={report} />
                      ))}
                    {page === "cost" && <CostPage report={report} />}
                    {page === "documents" && <DocumentsPage report={report} open={detail} />}
                    {page === "chunks" && <ChunksPage report={report} />}
                    {page === "settings" && (
                      <SettingsPage report={report} {...(run.source ? { source: run.source } : {})} />
                    )}
                  </div>
                </IgnoreProvider>
              </PageErrorBoundary>
            </main>
          </SidebarInset>
        </SidebarProvider>
        <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      </FolderRunsContext.Provider>
    </PlanProvider>
  );
}
