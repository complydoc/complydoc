import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CostPage } from "@/features/cost/CostPage";
import { DocumentsPage } from "@/features/documents/DocumentsPage";
import { SecurityPage } from "@/features/security/SecurityPage";
import { SummaryPage } from "@/features/summary/SummaryPage";
import { useHashRoute } from "@/hooks/useHashRoute";
import type { Theme } from "@/hooks/useTheme";
import type { Report } from "@/report/types";

const PAGES = ["summary", "security", "cost", "documents"] as const;
type Page = (typeof PAGES)[number];

interface ReportViewProps {
  report: Report;
  name: string;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onClose: () => void;
}

/** One opened report: the header, the page tabs and the page. */
export function ReportView({ report, name, theme, onTheme, onClose }: ReportViewProps) {
  const [{ page, detail }, go] = useHashRoute(PAGES);
  const counts: Record<Page, number | undefined> = {
    summary: undefined,
    security: report.aggregate.sensitive_total,
    cost: undefined,
    documents: report.documents.length,
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex items-center gap-4">
        <span className="shrink-0">
          <Logo size={24} />
        </span>
        <p className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block" title={name}>
          {name}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle theme={theme} onChange={onTheme} />
          <Button variant="outline" size="sm" onClick={onClose}>
            Open another
          </Button>
        </div>
      </header>

      <Tabs value={page} onValueChange={(value) => go(value as Page)} className="gap-8">
        <TabsList aria-label="Report pages">
          {PAGES.map((id) => (
            <TabsTrigger key={id} value={id} className="capitalize">
              {id}
              {counts[id] !== undefined && <Badge variant="secondary">{counts[id]}</Badge>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="summary">
          <SummaryPage report={report} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityPage report={report} />
        </TabsContent>
        <TabsContent value="cost">
          <CostPage report={report} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsPage report={report} open={detail} />
        </TabsContent>
      </Tabs>

    </div>
  );
}
