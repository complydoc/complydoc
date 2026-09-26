import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ToneBadge } from "@/components/ToneBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { TICKED, useIgnores, useIsIgnored } from "@/hooks/useIgnores";
import type { PageFinding } from "@/report/pageFindings";
import { severityTone } from "@/report/select";

interface FindingPopoverProps {
  finding: PageFinding | null;
  /** Where the finding's text is on screen, to open beside. */
  rect: DOMRect | null;
  onClose: () => void;
}

/**
 * A finding clicked in the text: what it is, how sure complydoc is, and a box to
 * tick it off as not a problem. Under `complydoc ui` the tick is saved to the
 * ignore file; otherwise it lasts while the page is open.
 */
export function FindingPopover({ finding, rect, onClose }: FindingPopoverProps) {
  const { editable, ignore, unignore } = useIgnores();
  const isIgnored = useIsIgnored();
  const open = finding !== null && rect !== null;
  // The popover opens beside the text it is about, which is no element of its own.
  const anchor = { current: { getBoundingClientRect: () => rect ?? new DOMRect() } };

  return (
    <Popover open={open} onOpenChange={(next) => !next && onClose()}>
      <PopoverAnchor virtualRef={anchor} />
      {finding && (
        <PopoverContent align="start" className="w-80" onOpenAutoFocus={(event) => event.preventDefault()}>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-1">
              <span className="font-medium">{finding.label}</span>
              <code className="line-clamp-3 font-mono text-xs break-words text-muted-foreground">
                {finding.kind === "hidden" ? `“${finding.value}”` : finding.value}
              </code>
            </div>
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
                    ? ignore({ finding: finding.fingerprint, reason: TICKED, what: `${finding.label} ${finding.value}` })
                    : unignore(finding.fingerprint));
                }}
              />
              <span className="leading-5">
                Not a problem: ignore it
                <span className="block text-xs text-muted-foreground">
                  {editable
                    ? "Saved to the ignore file; it leaves every count from the next run."
                    : "Kept while this page is open. Open the report with complydoc ui to save it."}
                </span>
              </span>
            </label>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
