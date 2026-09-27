import { BarList } from "@/components/BarList";
import { NotInRun } from "@/components/NotInRun";
import { Section, SectionStack } from "@/components/Section";
import { Stat, StatGrid } from "@/components/Stat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { fileName, formatCount, humanise } from "@/report/format";
import { measured } from "@/report/measured";
import { documentHref } from "@/report/route";
import { evidenceCounts, findingRows, hiddenInstructions, ignoredRows, severityByDocument } from "@/report/security";
import { SEVERITIES, categoriesByCount } from "@/report/select";
import type { Report } from "@/report/types";
import { FindingTable } from "./FindingTable";
import { HiddenInstructions } from "./HiddenInstructions";
import { IgnoredFindings } from "./IgnoredFindings";
import { JudgedConcepts } from "./JudgedConcepts";
import { judgedRows } from "@/report/judged";
import { notLookedFor } from "@/report/limitations";
import { NotLookedFor } from "./NotLookedFor";

const BY_KIND = { count: { label: "Found", color: "var(--chart-5)" } } satisfies ChartConfig;
const BY_EVIDENCE = { count: { label: "Found", color: "var(--primary)" } } satisfies ChartConfig;
const BY_SEVERITY = {
  high: { label: "High", color: "var(--destructive)" },
  medium: { label: "Medium", color: "var(--warning)" },
  low: { label: "Low", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Bars a chart shows before it counts the rest, which the table below lists in full. */
const TOP = 10;

function More({ count, noun }: { count: number; noun: string }) {
  if (count <= 0) return null;
  const toTable = () =>
    document.querySelector('section[aria-label="Every finding"]')?.scrollIntoView({ behavior: "smooth" });
  return (
    <Button variant="link" size="sm" className="h-auto self-start p-0 text-xs text-muted-foreground" onClick={toTable}>
      and {formatCount(count)} more {count === 1 ? noun : `${noun}s`}, in every finding below
    </Button>
  );
}

/** What the documents carry that should not leave: how much, what, where, and every finding. */
export function SecurityPage({ report }: { report: Report }) {
  if (!measured(report, "sensitive")) return <NotInRun report={report} content="sensitive" />;
  const { aggregate } = report;
  const hidden = hiddenInstructions(report);
  const byDocument = severityByDocument(report).map((row) => ({
    ...row,
    document: fileName(row.path),
    index: report.documents.findIndex((d) => d.relative_path === row.path),
  }));
  const kinds = categoriesByCount(report);
  const ignored = ignoredRows(report);
  const judged = judgedRows(report);
  const unscanned = notLookedFor(report);

  return (
    <SectionStack>
      {unscanned.length > 0 && <NotLookedFor categories={unscanned} documents={report.documents.length} />}
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
          {ignored.length > 0 && <Stat label="Ignored" value={formatCount(ignored.length)} />}
        </StatGrid>
      </Section>

      <Section title="What and where">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By kind</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <BarList series={BY_KIND} data={kinds.slice(0, TOP)} category="label" />
              <More count={kinds.length - TOP} noun="kind" />
            </CardContent>
          </Card>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>By document</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <BarList
                  series={BY_SEVERITY}
                  data={byDocument.slice(0, TOP)}
                  category="document"
                  onSelect={(row) => (window.location.hash = documentHref(row.index).slice(1))}
                />
                <More count={byDocument.length - TOP} noun="document" />
              </CardContent>
            </Card>
            <Card>
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

      {judged.length > 0 && (
        <Section title="Found by a model" aside="Your concepts, on pages a judgement model read">
          <JudgedConcepts rows={judged} judge={report.concepts?.judge ?? null} />
        </Section>
      )}

      <Section title="Every finding">
        <FindingTable rows={findingRows(report)} />
      </Section>

      {ignored.length > 0 && (
        <Section title="Ignored" aside="Set aside with a reason, and left out of every count above">
          <IgnoredFindings rows={ignored} />
        </Section>
      )}
    </SectionStack>
  );
}
