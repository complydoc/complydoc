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
import { CostPage } from "@/features/cost/CostPage";
import { DocumentsPage } from "@/features/documents/DocumentsPage";
import { SecurityPage } from "@/features/security/SecurityPage";
import { HomePage } from "@/features/home/HomePage";
import { useHashRoute } from "@/hooks/useHashRoute";
import { ModeToggle } from "@/components/ModeToggle";
import { PlanBar } from "@/components/PlanBar";
import { PlanProvider } from "@/components/PlanProvider";
import { cn } from "@/lib/utils";
import { CollectionSwitcher, type Selection } from "@/components/CollectionSwitcher";
import { OverviewPage } from "@/features/collections/OverviewPage";
import type { Collection, Loaded } from "@/report/collections";
import { fileName } from "@/report/format";
import { AppSidebar } from "./AppSidebar";
import { PAGES, PAGE_INFO } from "./pages";

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

/** The run a selection points at, and the run of the same folder before it. */
function selected(collections: Collection[], selection: Selection): { run: Loaded | null; previous: Loaded | null } {
  const collection = collections.find((c) => c.id === selection.collection);
  if (!collection) return { run: null, previous: null };
  const index = Math.max(
    0,
    collection.runs.findIndex((r) => r.id === selection.run),
  );
  return { run: collection.runs[index] ?? null, previous: collection.runs[index + 1] ?? null };
}

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
  const { run, previous } = selected(collections, selection);
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
      <SidebarProvider>
        <AppSidebar report={null} page={page} switcher={switcher} />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>All collections</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ModeToggle dark={dark} onToggle={onToggleTheme} />
            </div>
          </header>
          <main className="mx-auto w-full max-w-none p-4 md:p-6">
            <OverviewPage
              collections={collections}
              onOpen={(id) =>
                onSelect({ collection: id, run: collections.find((c) => c.id === id)?.runs[0]?.id ?? null })
              }
            />
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const report = run.report;
  const name = collections.find((c) => c.id === selection.collection)?.name ?? run.name;
  const open = page === "documents" && detail !== null ? report.documents[Number(detail.split("/")[0])] : undefined;

  return (
    // A fresh plan for each run: the models it lists are its own.
    <PlanProvider key={run.id} report={report}>
      <SidebarProvider>
        <AppSidebar report={report} page={page} switcher={switcher} />
        {/* min-w-0 lets the page shrink to the space beside the sidebar instead of widening to its widest chart. */}
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
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
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <PlanBar />
              <ModeToggle dark={dark} onToggle={onToggleTheme} />
            </div>
          </header>
          <main className={cn("mx-auto w-full p-4 md:p-6", page === "documents" ? "max-w-none" : "max-w-7xl")}>
            {page === "home" && <HomePage report={report} previous={previous?.report ?? null} />}
            {page === "security" && <SecurityPage report={report} />}
            {page === "cost" && <CostPage report={report} />}
            {page === "documents" && <DocumentsPage report={report} open={detail} />}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </PlanProvider>
  );
}
