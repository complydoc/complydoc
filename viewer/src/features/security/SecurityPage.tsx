import { DataTable, type Column } from "@/components/DataTable";
import { Section, SectionStack } from "@/components/Section";
import { Stat, StatGrid } from "@/components/Stat";
import { ToneBadge } from "@/components/ToneBadge";
import { fileName, formatCount, humanise } from "@/report/format";
import { SEVERITIES, categoriesByCount, documentRows, severityTone, type CategoryCount, type DocumentRow } from "@/report/select";
import type { Report } from "@/report/types";

const categoryColumns: Column<CategoryCount>[] = [
  { header: "Identifier", cell: (row) => row.label },
  { header: "Found", cell: (row) => formatCount(row.count), numeric: true },
];

const documentColumns: Column<DocumentRow>[] = [
  { header: "Document", cell: (row) => fileName(row.path) },
  { header: "Items", cell: (row) => formatCount(row.findings), numeric: true },
  {
    header: "Highest",
    cell: (row) => row.highest && <ToneBadge tone={severityTone(row.highest)}>{row.highest}</ToneBadge>,
  },
];

/** What the documents carry that should not leave: by severity, by kind, and where. */
export function SecurityPage({ report }: { report: Report }) {
  const { aggregate } = report;
  const exposed = documentRows(report)
    .filter((row) => row.findings > 0)
    .sort((a, b) => b.findings - a.findings);

  return (
    <SectionStack>
      <Section title="By severity" aside={`${formatCount(aggregate.sensitive_total)} items`}>
        <StatGrid>
          {SEVERITIES.map((severity) => (
            <Stat key={severity} label={humanise(severity)} value={formatCount(aggregate.sensitive_by_severity[severity] ?? 0)} />
          ))}
        </StatGrid>
      </Section>

      <Section title="By kind">
        <DataTable caption="Identifiers found, by kind" columns={categoryColumns} rows={categoriesByCount(report)} rowKey={(row) => row.category} />
      </Section>

      <Section title="Where" aside={`${exposed.length} of ${report.documents.length} documents`}>
        <DataTable caption="Documents carrying identifiers" columns={documentColumns} rows={exposed} rowKey={(row) => row.path} />
      </Section>
    </SectionStack>
  );
}
