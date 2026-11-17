import { cn } from "cn";
import { CircleDollarSignIcon, EyeOffIcon, FileCheckIcon, FileTextIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { useContext } from "react";
import { BarList } from "@/components/BarList";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { Panel } from "@/components/Panel";
import { EmptyState } from "@/components/EmptyState";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { SplitterTable } from "@/features/chunks/SplitterTable";
import { Section } from "@/components/Section";
import { ToneBadge } from "@/components/ToneBadge";
import type { ChartConfig } from "@/components/ui/chart";
import { usePlan } from "@/hooks/usePlan";
import { fileName, formatCount, formatPageUsd, formatSeconds, plural } from "@/report/format";
import { attentionDocuments, topFindings } from "@/report/home";
import { measured } from "@/report/measured";
import { isInstruction } from "@/report/security";
import { documentTotals, reportTotals } from "@/report/planEstimate";
import { documentHref } from "@/report/route";
import type { Report } from "@/report/types";
import { LinkStat, SeeAll } from "./HomeParts";
import { ReadinessCard } from "./ReadinessCard";
import { RunTrends } from "./RunTrends";
import { stepRows } from "@/report/stepTimes";
import { StepTimes } from "./StepTimes";

/** A headline figure that is also the way to what it counts. */
const COST = { usd: { label: "Cost", color: "var(--viz-mint)" } } satisfies ChartConfig;

/**
 * The run's dashboard: its headline figures, where its time went step by step, how the
 * folder's or pipeline's runs compare, the findings that matter, the documents to open
 * first, and what reading the folder costs and takes under the plan chosen. Every block
 * leads somewhere.
 */
export function HomePage({ report }: { report: Report }) {
  const { plan } = usePlan();
  const trends = useContext(FolderRunsContext).runs.length > 1;
  const totals = reportTotals(report, plan);
  const findings = topFindings(report);
  const documents = attentionDocuments(report);
  // Text hidden from a reader is worth a look; an instruction to a model is the finding.
  const passages = report.documents.flatMap((document) => document.content_findings);
  const hidden = passages.filter(isInstruction).length;
  const hiddenText = passages.length - hidden;
  const scanned = measured(report, "sensitive");
  const priced = measured(report, "cost");
  const hasDocuments = measured(report, "documents");
  const byCost = report.documents
    .map((document, index) => ({
      name: fileName(document.relative_path),
      index,
      usd: documentTotals(report, document, plan).usd ?? 0,
    }))
    .filter((row) => row.usd > 0)
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 8);

  return (
    // One even gap between rows, as a dashboard's grid has.
    <div className="flex flex-col gap-5">
      {/* Only what the run measured: a figure it did not take is left out, not shown as a dash. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-y-4 divide-x">
        {hasDocuments && (
        <LinkStat
          href="#documents"
          label="Documents"
          icon={FileTextIcon}
          hue="violet"
          value={formatCount(totals.documents || report.documents.length)}
          note={plural(report.aggregate.pages_total, "page")}
        />
        )}
        {scanned && (
        <LinkStat
          href="#security"
          label="High-severity identifiers"
          icon={ShieldAlertIcon}
          hue="coral"
          value={formatCount(findings.high)}
          note={`${formatCount(findings.confirmedHigh)} proved by a check`}
        />
        )}
        {scanned && (
        <LinkStat
          href="#security"
          label="Hidden instructions"
          icon={EyeOffIcon}
          hue="amber"
          value={formatCount(hidden)}
          note={
            hidden
              ? "passages written for a model, not a reader"
              : hiddenText
                ? `none; ${plural(hiddenText, "passage")} of hidden text`
                : "none found"
          }
        />
        )}
        {priced && (
        <LinkStat
          href="#cost"
          label="To read it all"
          icon={CircleDollarSignIcon}
          hue="mint"
          value={formatPageUsd(totals.usd)}
          note={[plan.text?.name, totals.seconds !== null ? formatSeconds(totals.seconds) : null]
            .filter(Boolean)
            .join(" · ")}
        />
        )}
      </div>

      {(() => {
        // The grid follows what the run has: with runs to compare, readiness stands tall beside
        // the time and the trends; with one run it lies flat beside the time; alone, it spans.
        const time = stepRows(report).length > 0 && (
          <Panel
            title="Where the time goes"
            description="Each step's share of the run"
            action={<SeeAll href="#pipeline?trace=open">Trace</SeeAll>}
          >
            <StepTimes report={report} />
          </Panel>
        );
        const readiness = (flat: boolean) =>
          measured(report, "readiness") && (
            <Panel title="Readiness" description="How fit to send">
              <ReadinessCard report={report} row={flat} />
            </Panel>
          );
        if (trends)
          return (
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
                {time}
                <RunTrends />
              </div>
              {readiness(false)}
            </div>
          );
        if (!readiness(true)) return time || null;
        return time ? (
          <div className="grid gap-4 xl:grid-cols-5">
            <div className="min-w-0 xl:col-span-3 [&>section]:h-full">{time}</div>
            <div className="min-w-0 xl:col-span-2 [&>section]:h-full">{readiness(true)}</div>
          </div>
        ) : (
          readiness(true)
        );
      })()}

      {(scanned || hasDocuments) && (
        <div className={cn("grid gap-4", scanned && hasDocuments && "lg:grid-cols-2")}>
        {scanned && (
        <Panel
          title="Needs attention"
          description="High-severity identifiers, the surest first"
          action={<SeeAll href="#security?severity=high">All</SeeAll>}
          bodyClassName="p-0"
        >
          {findings.rows.length === 0 ? (
            <EmptyState
              icon={ShieldCheckIcon}
              title="No high-severity identifiers"
              description="Nothing in these documents needs a look first."
            />
          ) : (
            <ul className="flex flex-col divide-y">
              {findings.rows.map((row) => (
                <li key={row.id} className="flex h-14 items-center gap-3 px-4 text-sm">
                  <a
                    href={documentHref(row.document, row.page, { kind: "identifier", index: row.match })}
                    className="min-w-0 flex-1 hover:underline"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-medium">{row.label}</span>
                      {row.values > 1 ? (
                        <span className="shrink-0 text-xs text-muted-foreground">{row.values} values</span>
                      ) : (
                        <code className="shrink-0 font-mono text-xs text-muted-foreground">{row.masked}</code>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {fileName(row.path)}
                      {row.pages.length > 0 && `, ${row.pages.length > 1 ? "pages" : "page"} ${row.pages.join(", ")}`}
                    </span>
                  </a>
                  <EvidenceBadge evidence={row.evidence} match={row.source} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        )}

        {hasDocuments && (
        <Panel
          title="Documents to look at"
          description="The most to look at first, and why"
          action={<SeeAll href="#documents">All</SeeAll>}
          bodyClassName="p-0"
        >
          {documents.length === 0 ? (
            <EmptyState
              icon={FileCheckIcon}
              title="Nothing stands out"
              description="No document has a finding worth opening first."
            />
          ) : (
            <ul className="flex flex-col divide-y">
              {documents.slice(0, findings.rows.length || 6).map((row) => (
                <li key={row.index} className="flex h-14 items-center gap-3 px-4 text-sm">
                  <a
                    href={documentHref(row.index)}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                    title={row.path}
                  >
                    {fileName(row.path)}
                  </a>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
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
        </Panel>
        )}
      </div>
      )}

      {priced && (
      <Panel
        title="Where the cost goes"
        description="Each document under the plan chosen"
        action={<SeeAll href="#cost">Cost &amp; time</SeeAll>}
      >
        {byCost.length === 0 ? (
          <EmptyState
            icon={CircleDollarSignIcon}
            title="Nothing to price"
            description="No document could be priced on the model chosen."
            className="py-6"
          />
        ) : (
          <BarList
            series={COST}
            data={byCost}
            category="name"
            format={formatPageUsd}
            onSelect={(row) => window.location.assign(documentHref(row.index))}
          />
        )}
      </Panel>
      )}

      {measured(report, "chunks") && (
        <Section title="Chunks" aside={<SeeAll href="#chunks">Chunks</SeeAll>}>
          <SplitterTable runs={report.chunks ?? []} />
        </Section>
      )}
    </div>
  );
}
