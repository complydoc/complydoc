import { Checkbox } from "@/components/ui/checkbox";
import { TICKED, useIgnores, useIsIgnored } from "@/hooks/useIgnores";
import { cn } from "@/lib/utils";
import type { PageFinding } from "@/report/pageFindings";

interface FindingChecklistProps {
  findings: PageFinding[];
  /** The finding a link opened, marked out from the rest. */
  active: string | null;
}

/**
 * What was found on the page, each with a box to tick it off as not a problem.
 * A ticked finding is crossed out here and no longer marked in the text.
 */
export function FindingChecklist({ findings, active }: FindingChecklistProps) {
  const { editable, ignore, unignore } = useIgnores();
  const isIgnored = useIsIgnored();
  if (findings.length === 0) return null;
  const open = findings.filter((f) => !isIgnored(f)).length;

  return (
    <section aria-label="Found on this page" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        Found on this page <span className="font-normal text-muted-foreground">{open}</span>
      </h3>
      <ul className="flex flex-col gap-1">
        {findings.map((finding) => {
          const ignored = isIgnored(finding);
          // Without complydoc ui, one the run's file set aside cannot be brought back from here.
          const locked = !finding.fingerprint || (finding.ignoredByRun && !editable);
          const id = `finding-${finding.key}`;
          return (
            <li
              key={finding.key}
              className={cn(
                "flex items-start gap-2 rounded-md px-1.5 py-1 text-sm",
                active === finding.key && "bg-primary/10 ring-1 ring-primary/40",
              )}
            >
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={ignored}
                disabled={locked}
                aria-label={`Ignore ${finding.label}`}
                onCheckedChange={(checked) => {
                  if (!finding.fingerprint) return;
                  void (checked
                    ? ignore({
                        finding: finding.fingerprint,
                        reason: TICKED,
                        what: `${finding.label} ${finding.value}`,
                      })
                    : unignore(finding.fingerprint));
                }}
              />
              <label
                htmlFor={id}
                className={cn("min-w-0 flex-1 leading-5", ignored && "text-muted-foreground line-through")}
              >
                <span className={cn(!ignored && finding.severity === "high" && "text-destructive")}>
                  {finding.label}
                </span>{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {finding.kind === "hidden" ? `“${finding.value.slice(0, 60)}…”` : finding.value}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {!editable && (
        <p className="text-xs text-faint">Kept while this page is open. Open it with complydoc ui to save.</p>
      )}
    </section>
  );
}
