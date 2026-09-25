import { ChevronRightIcon } from "lucide-react";
import { NextSteps } from "@/components/NextSteps";
import { Section, SectionStack } from "@/components/Section";
import { nextSteps } from "@/report/next";
import { Stat, StatGrid } from "@/components/Stat";
import { formatCount, formatSeconds, plural } from "@/report/format";
import { summaryCaveats } from "@/report/select";
import type { Report } from "@/report/types";
import { Caveats } from "./Caveats";
import { QuickWins } from "./QuickWins";
import { ReadinessCard } from "./ReadinessCard";
import { RunChanges } from "./RunChanges";

/** The folder at a glance: how ready it is, what to do first, and the headline figures. */
export function SummaryPage({ report, previous = null }: { report: Report; previous?: Report | null }) {
  const { aggregate } = report;
  const caveats = summaryCaveats(report);

  return (
    <SectionStack>
      <Section title="Readiness">
        <ReadinessCard report={report} />
      </Section>

      {previous && (
        <Section title="Changed since the run before">
          <RunChanges report={report} previous={previous} />
        </Section>
      )}

      <Section title="Quick wins">
        <QuickWins wins={report.quick_wins} />
      </Section>

      <Section title="In numbers">
        <StatGrid>
          <Stat label="Documents" value={formatCount(aggregate.documents_audited)} note={plural(aggregate.pages_total, "page")} />
          <Stat
            label="Sensitive items"
            value={formatCount(aggregate.sensitive_total)}
            note={`in ${plural(aggregate.documents_with_sensitive_data, "document")}`}
          />
          <Stat label="Hidden instructions" value={formatCount(aggregate.content_findings_total)} />
          <Stat label="Time per document" value={formatSeconds(aggregate.seconds_per_document)} note="on this machine" />
          {report.verification && (
            <Stat
              label="Pages a vision read disputes"
              value={formatCount(report.verification.pages_disagree)}
              note={`of ${plural(report.verification.pages_checked, "page")} checked`}
            />
          )}
        </StatGrid>
      </Section>

      <Section title="Find out more">
        <NextSteps steps={nextSteps(report)} />
      </Section>

      {caveats.length > 0 && (
        // Useful when a figure above needs its footnote, so it waits to be opened rather than taking the page.
        <details className="group text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground hover:text-foreground">
            <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" />
            {plural(caveats.length, "note")} on what this run could not check
          </summary>
          <div className="mt-3">
            <Caveats caveats={caveats} />
          </div>
        </details>
      )}
    </SectionStack>
  );
}
