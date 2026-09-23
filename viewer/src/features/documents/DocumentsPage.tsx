import { Section, SectionStack } from "@/components/Section";
import { documentRows } from "@/report/select";
import { parseTarget } from "@/report/route";
import type { Report } from "@/report/types";
import { DocumentDetail } from "./detail/DocumentDetail";
import { DocumentTable } from "./DocumentTable";
import { LoadersSection } from "./loaders/LoadersSection";

interface DocumentsPageProps {
  report: Report;
  /** What is open, from the URL (`3`, `3/2` or `3/2/i5`); null for the list. */
  open: string | null;
}

/** Every document and, when loaders were compared, which one read them best; or one document, page by page. */
export function DocumentsPage({ report, open }: DocumentsPageProps) {
  const target = open === null ? null : parseTarget(open);
  const document = target ? report.documents[target.document] : undefined;
  if (target && document) {
    return (
      <DocumentDetail
        key={open}
        report={report}
        document={document}
        index={target.document}
        page={target.page}
        finding={target.finding}
      />
    );
  }

  return (
    <SectionStack>
      {report.loader_comparison && <LoadersSection comparison={report.loader_comparison} />}
      <Section title="Documents">
        <DocumentTable rows={documentRows(report)} />
      </Section>
    </SectionStack>
  );
}
