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
import { SummaryPage } from "@/features/summary/SummaryPage";
import { useHashRoute } from "@/hooks/useHashRoute";
import { ModeToggle } from "@/components/ModeToggle";
import { PlanBar } from "@/components/PlanBar";
import { PlanProvider } from "@/components/PlanProvider";
import { fileName } from "@/report/format";
import type { Report } from "@/report/types";
import { AppSidebar } from "./AppSidebar";
import { PAGES, PAGE_INFO } from "./pages";

interface ReportViewProps {
  report: Report;
  name: string;
  /** Whether the dark theme is showing, and how to switch. */
  dark: boolean;
  onToggleTheme: () => void;
  onClose: () => void;
}

/** One opened report: the sidebar, a bar saying where you are, and the page. */
export function ReportView({ report, name, dark, onToggleTheme, onClose }: ReportViewProps) {
  const [{ page, detail }] = useHashRoute(PAGES);
  const open = page === "documents" && detail !== null ? report.documents[Number(detail.split("/")[0])] : undefined;

  return (
    <PlanProvider report={report}>
      <SidebarProvider>
        <AppSidebar report={report} name={name} page={page} onClose={onClose} />
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
          <main className="mx-auto w-full max-w-7xl p-4 md:p-6">
            {page === "summary" && <SummaryPage report={report} />}
            {page === "security" && <SecurityPage report={report} />}
            {page === "cost" && <CostPage report={report} />}
            {page === "documents" && <DocumentsPage report={report} open={detail} />}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </PlanProvider>
  );
}
