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
import type { Theme } from "@/hooks/useTheme";
import { fileName } from "@/report/format";
import type { Report } from "@/report/types";
import { AppSidebar } from "./AppSidebar";
import { PAGES, PAGE_INFO } from "./pages";

interface ReportViewProps {
  report: Report;
  name: string;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onClose: () => void;
}

/** One opened report: the sidebar, a bar saying where you are, and the page. */
export function ReportView({ report, name, theme, onTheme, onClose }: ReportViewProps) {
  const [{ page, detail }] = useHashRoute(PAGES);
  const open = page === "documents" && detail !== null ? report.documents[Number(detail.split("/")[0])] : undefined;

  return (
    <SidebarProvider>
      <AppSidebar report={report} name={name} page={page} theme={theme} onTheme={onTheme} onClose={onClose} />
      {/* min-w-0 lets the page shrink to the space beside the sidebar instead of widening to its widest chart. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">{name}</BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
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
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 md:p-6">
          {page === "summary" && <SummaryPage report={report} />}
          {page === "security" && <SecurityPage report={report} />}
          {page === "cost" && <CostPage report={report} />}
          {page === "documents" && <DocumentsPage report={report} open={detail} />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
