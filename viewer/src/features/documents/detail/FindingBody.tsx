import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ToneBadge } from "@/components/ToneBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { TICKED, useIgnores, useIsIgnored } from "@/hooks/useIgnores";
import { ignoreDescription, type FindingContext, type PageFinding } from "@/report/pageFindings";
import { severityTone } from "@/report/select";

/**
 * What a finding is and what can be done with it: how serious and how sure, where it is,
 * the line it sits in, and a box to tick it off as not a problem. Under `complydoc ui` the
 * tick is saved to the ignore file; otherwise it lasts while the page is open.
 */
export function FindingBody({ finding, context = null }: { finding: PageFinding; context?: FindingContext | null }) {
  const { editable, ignore, unignore } = useIgnores();
  const isIgnored = useIsIgnored();
  return (
    <div className="flex flex-col gap-3 text-sm">
      {context ? (
        <p className="rounded-md bg-muted/60 px-2 py-1.5 font-mono text-xs leading-relaxed break-words text-muted-foreground">
          {context.before}
          <mark className="rounded-sm bg-destructive/20 px-0.5 text-foreground">{context.hit}</mark>
          {context.after}
        </p>
      ) : (
        <code className="line-clamp-3 font-mono text-xs break-words text-muted-foreground">
          {finding.kind === "hidden" ? `“${finding.value}”` : finding.value}
        </code>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToneBadge tone={severityTone(finding.severity)}>{finding.severity}</ToneBadge>
        {finding.evidence && <EvidenceBadge evidence={finding.evidence} match={finding.match} />}
        <span className="text-xs text-muted-foreground">
          {finding.page !== null && `page ${finding.page}`}
          {finding.count > 1 && ` · found ${finding.count} times`}
        </span>
      </div>
      <label className="flex items-start gap-2">
        <Checkbox
          className="mt-0.5"
          checked={isIgnored(finding)}
          disabled={!finding.fingerprint || (finding.ignoredByRun && !editable)}
          onCheckedChange={(checked) => {
            if (!finding.fingerprint) return;
            void (checked
              ? ignore({ finding: finding.fingerprint, reason: TICKED, what: ignoreDescription(finding) })
              : unignore(finding.fingerprint));
          }}
        />
        <span className="leading-5">
          Not a problem: ignore it
          <span className="block text-xs text-muted-foreground">
            {editable
              ? "This will be ignored for current and future runs."
              : "Kept while this page is open. Open the report with complydoc ui to save it."}
          </span>
        </span>
      </label>
    </div>
  );
}
