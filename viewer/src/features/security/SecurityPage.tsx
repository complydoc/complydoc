import { BarList } from "@/components/BarList";
import { Section, SectionStack } from "@/components/Section";
import { Stat, StatGrid } from "@/components/Stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { fileName, formatCount, humanise } from "@/report/format";
import { documentHref } from "@/report/route";
import { evidenceCounts, findingRows, hiddenInstructions, severityByDocument } from "@/report/security";
import { SEVERITIES, categoriesByCount } from "@/report/select";
import type { Report } from "@/report/types";
import { FindingTable } from "./FindingTable";
import { HiddenInstructions } from "./HiddenInstructions";

const BY_KIND = { count: { label: "Found", color: "var(--chart-5)" } } satisfies ChartConfig;
const BY_EVIDENCE = { count: { label: "Found", color: "var(--primary)" } } satisfies ChartConfig;
const BY_SEVERITY = {
  high: { label: "High", color: "var(--destructive)" },
  medium: { label: "Medium", color: "var(--warning)" },
  low: { label: "Low", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** What the documents carry that should not leave: how much, what, where, and every finding. */
export function SecurityPage({ report }: { report: Report }) {
  const { aggregate } = report;
  const hidden = hiddenInstructions(report);
  const byDocument = severityByDocument(report).map((row) => ({
    ...row,
    document: fileName(row.path),
    index: report.documents.findIndex((d) => d.relative_path === row.path),
  }));
  const kinds = categoriesByCount(report);

  return (
    <SectionStack>
      <Section title="Found">
        <StatGrid>
          {SEVERITIES.map((severity) => (
            <Stat
              key={severity}
              label={`${humanise(severity)} severity`}
              value={formatCount(aggregate.sensitive_by_severity[severity] ?? 0)}
            />
          ))}
          <Stat label="Hidden instructions" value={formatCount(hidden.length)} />
        </StatGrid>
      </Section>

      <Section title="What and where">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By kind</CardTitle>
            </CardHeader>
            <CardContent>
              <BarList series={BY_KIND} data={kinds} category="label" />
            </CardContent>
          </Card>
          <div className="flex flex-col gap-4">
            <Card className="flex-1">
              <CardHeader>
                <CardTitle>By document</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  series={BY_SEVERITY}
                  data={byDocument}
                  category="document"
                  onSelect={(row) => (window.location.hash = documentHref(row.index).slice(1))}
                />
              </CardContent>
            </Card>
            <Card className="flex-1">
              <CardHeader>
                <CardTitle>How sure</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList series={BY_EVIDENCE} data={evidenceCounts(report)} category="label" />
              </CardContent>
            </Card>
          </div>
        </div>
      </Section>

      {hidden.length > 0 && (
        <Section title="Hidden instructions">
          <HiddenInstructions found={hidden} />
        </Section>
      )}

      <Section title="Every finding">
        <FindingTable rows={findingRows(report)} />
      </Section>
    </SectionStack>
  );
}
