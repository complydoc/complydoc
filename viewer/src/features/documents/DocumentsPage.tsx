import { Section, SectionStack } from "@/components/Section";
import { documentRows } from "@/report/select";
import type { Report } from "@/report/types";
import { DocumentDetail } from "./detail/DocumentDetail";
import { DocumentTable } from "./DocumentTable";
import { LoadersSection } from "./loaders/LoadersSection";

interface DocumentsPageProps {
  report: Report;
  /** The index of the open document, from the URL; null for the list. */
  open: string | null;
}

/** Every document and, when loaders were compared, which one read them best; or one document, page by page. */
export function DocumentsPage({ report, open }: DocumentsPageProps) {
  const document = open === null ? undefined : report.documents[Number(open)];
  if (document) return <DocumentDetail key={open} report={report} document={document} />;

  return (
    <SectionStack>
      {report.loader_comparison && <LoadersSection comparison={report.loader_comparison} />}
      <Section title="Documents" aside="open one to compare its readings">
        <DocumentTable rows={documentRows(report)} />
      </Section>
    </SectionStack>
  );
}
