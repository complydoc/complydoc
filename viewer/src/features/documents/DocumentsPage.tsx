import { DataTable, type Column } from "@/components/DataTable";
import { Section, SectionStack } from "@/components/Section";
import { ToneBadge } from "@/components/ToneBadge";
import { fileName, formatCount, formatScore } from "@/report/format";
import { bandOf, bandTone, documentRows, severityTone, type DocumentRow } from "@/report/select";
import type { Report } from "@/report/types";
import { LoadersSection } from "./loaders/LoadersSection";

const columns: Column<DocumentRow>[] = [
  { header: "Document", cell: (row) => <span title={row.path}>{fileName(row.path)}</span> },
  { header: "Format", cell: (row) => row.format.toUpperCase() },
  { header: "Pages", cell: (row) => formatCount(row.pages), numeric: true },
  {
    header: "Readiness",
    cell: (row) => <ToneBadge tone={bandTone(bandOf(row.score))}>{formatScore(row.score)}</ToneBadge>,
    numeric: true,
  },
  {
    header: "Sensitive",
    cell: (row) =>
      row.highest ? <ToneBadge tone={severityTone(row.highest)}>{formatCount(row.findings)}</ToneBadge> : "–",
    numeric: true,
  },
];

/** Every document, and, when loaders were compared, which loader read them best. */
export function DocumentsPage({ report }: { report: Report }) {
  return (
    <SectionStack>
      {report.loader_comparison && <LoadersSection comparison={report.loader_comparison} />}
      <Section title="Documents" aside="least ready first">
        <DataTable caption="Documents" columns={columns} rows={documentRows(report)} rowKey={(row) => row.path} />
      </Section>
    </SectionStack>
  );
}
