import { Section, SectionStack } from "@/components/Section";
import { usePlan } from "@/hooks/usePlan";
import { formatPageUsd, formatSeconds, plural } from "@/report/format";
import { reportTotals } from "@/report/plan";
import { documentTree } from "@/report/tree";
import { parseTarget } from "@/report/route";
import type { Report } from "@/report/types";
import { DocumentDetail } from "./detail/DocumentDetail";
import { DocumentTree } from "./DocumentTree";
import { LoadersSection } from "./loaders/LoadersSection";
import { VerificationSection } from "./verification/VerificationSection";

interface DocumentsPageProps {
  report: Report;
  /** What is open, from the URL (`3`, `3/2` or `3/2/i5`); null for the list. */
  open: string | null;
}

/** Every document first, then which loader read them best and what a vision check found; or one document, page by page. */
export function DocumentsPage({ report, open }: DocumentsPageProps) {
  const { plan } = usePlan();
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
      <Section title="Documents" aside={<FolderTotals report={report} />}>
        <DocumentTree
          nodes={documentTree(report, plan)}
          vision={report.documents.some((document) => document.verification)}
        />
      </Section>
      {report.loader_comparison && <LoadersSection comparison={report.loader_comparison} />}
      {report.verification && <VerificationSection report={report} />}
    </SectionStack>
  );
}

/** The whole folder, beside the heading: what every document costs and takes under the plan. */
function FolderTotals({ report }: { report: Report }) {
  const { plan } = usePlan();
  const totals = reportTotals(report, plan);
  return (
    <span className="tabular-nums">
      {plural(totals.documents, "document")} · {plural(totals.pages, "page")} · {formatPageUsd(totals.usd)} ·{" "}
      {totals.seconds === null ? "not timed" : formatSeconds(totals.seconds)}
    </span>
  );
}
