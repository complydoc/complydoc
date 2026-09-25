import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { BarList } from "@/components/BarList";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { Section, SectionStack } from "@/components/Section";
import { ToneBadge } from "@/components/ToneBadge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { usePlan } from "@/hooks/usePlan";
import { fileName, formatCount, formatPageUsd, formatSeconds, plural } from "@/report/format";
import { attentionDocuments, topFindings } from "@/report/home";
import { documentTotals, reportTotals } from "@/report/plan";
import { documentHref } from "@/report/route";
import type { Report } from "@/report/types";
import { ReadinessCard } from "./ReadinessCard";
import { RunChanges } from "./RunChanges";

/** A headline figure that is also the way to what it counts. */
function LinkStat({ href, label, value, note }: { href: string; label: string; value: ReactNode; note?: string }) {
  return (
    <a
      href={href}
      className="group rounded-xl ring-1 ring-foreground/10 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex flex-col gap-1 p-4">
        <span className="flex items-center justify-between text-sm text-muted-foreground">
          {label}
          <ArrowRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
    </a>
  );
}

function SeeAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      {children}
      <ArrowRightIcon className="size-3.5" />
    </a>
  );
}

const COST = { usd: { label: "Cost", color: "var(--primary)" } } satisfies ChartConfig;

/**
 * Where an engineer opening a report should go: the findings that matter, the
 * documents to open first, and what reading the folder costs and takes under
 * the plan chosen. Every block leads somewhere.
 */
export function HomePage({ report, previous = null }: { report: Report; previous?: Report | null }) {
  const { plan } = usePlan();
  const totals = reportTotals(report, plan);
  const findings = topFindings(report);
  const documents = attentionDocuments(report);
  const hidden = report.aggregate.content_findings_total;
  const byCost = report.documents
    .map((document) => ({ name: fileName(document.relative_path), usd: documentTotals(report, document, plan).usd ?? 0 }))
    .filter((row) => row.usd > 0)
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 8);

  return (
    <SectionStack>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LinkStat
          href="#documents"
          label="Documents"
          value={formatCount(totals.documents || report.documents.length)}
          note={plural(report.aggregate.pages_total, "page")}
        />
        <LinkStat
          href="#security"
          label="High-severity identifiers"
          value={formatCount(findings.high)}
          note={`${formatCount(findings.confirmedHigh)} proved by a check`}
        />
        <LinkStat
          href="#security"
          label="Hidden instructions"
          value={formatCount(hidden)}
          note={hidden ? "passages written for a model, not a reader" : "none found"}
        />
        <LinkStat
          href="#cost"
          label="To read it all"
          value={formatPageUsd(totals.usd)}
          note={[plan.text?.name, totals.seconds !== null ? formatSeconds(totals.seconds) : null].filter(Boolean).join(" · ")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>High-severity identifiers, the surest first</CardDescription>
            <CardAction>
              <SeeAll href="#security">All findings</SeeAll>
            </CardAction>
          </CardHeader>
          <CardContent>
            {findings.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No high-severity identifier was found.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {findings.rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 py-2 text-sm">
                    <a
                      href={documentHref(row.document, row.page, { kind: "identifier", index: row.match })}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <span className="font-medium">{row.label}</span>{" "}
                      <code className="font-mono text-xs text-muted-foreground">{row.masked}</code>
                      <span className="block truncate text-xs text-muted-foreground">
                        {fileName(row.path)}
                        {row.page !== null && `, page ${row.page}`}
                      </span>
                    </a>
                    <EvidenceBadge evidence={row.evidence} match={row.source} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents to look at</CardTitle>
            <CardDescription>The most to look at first, and why</CardDescription>
            <CardAction>
              <SeeAll href="#documents">All documents</SeeAll>
            </CardAction>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing stands out in these documents.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {documents.map((row) => (
                  <li key={row.index} className="flex flex-col gap-1.5 py-2 text-sm">
                    <a href={documentHref(row.index)} className="truncate font-medium hover:underline" title={row.path}>
                      {fileName(row.path)}
                    </a>
                    <span className="flex flex-wrap gap-1.5">
                      {row.reasons.map((reason) => (
                        <ToneBadge key={reason.label} tone={reason.tone}>
                          {reason.label}
                        </ToneBadge>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {previous && (
        <Section title="Changed since the run before">
          <RunChanges report={report} previous={previous} />
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Readiness">
          <ReadinessCard report={report} />
        </Section>
        <Section title="Where the cost goes" aside={<SeeAll href="#cost">Cost &amp; time</SeeAll>}>
          <Card>
            <CardContent>
              {byCost.length === 0 ? (
                <p className="text-sm text-muted-foreground">No document could be priced on the model chosen.</p>
              ) : (
                <BarList series={COST} data={byCost} category="name" format={formatPageUsd} />
              )}
            </CardContent>
          </Card>
        </Section>
      </div>
    </SectionStack>
  );
}
