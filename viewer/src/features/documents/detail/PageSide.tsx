import { ChevronLeftIcon, ChevronRightIcon, EyeOffIcon, FlagIcon } from "lucide-react";
import { ToneBadge } from "@/components/ToneBadge";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/usePlan";
import { formatPageUsd, formatSeconds, fileName } from "@/report/format";
import type { Highlight } from "@/report/highlight";
import { hasPicture } from "@/report/picture";
import { pageEstimate } from "@/report/plan";
import type { FindingRef } from "@/report/route";
import { severityTone } from "@/report/select";
import type { DocumentEntry, Report } from "@/report/types";
import { PagePane } from "./PagePane";
import { VisionNote } from "./VisionNote";

interface PageSideProps {
  report: Report;
  document: DocumentEntry;
  /** Position of the page on screen in the document's pages. */
  pageIndex: number;
  onPick: (index: number) => void;
  /** The finding opened from a link, to box on the page. */
  highlight: Highlight | null;
  onFinding: (ref: FindingRef) => void;
  /** Show the values, where the report holds them. */
  unmasked: boolean;
}

/**
 * The page the diff is on: its picture, what the vision check made of it, what
 * it costs to read under the plan, and what was found on it. It follows the diff
 * as it scrolls, and moving to another page here scrolls the diff there.
 */
export function PageSide({ report, document, pageIndex, onPick, highlight, onFinding, unmasked }: PageSideProps) {
  const { plan, models } = usePlan();
  const page = document.extracted_text[pageIndex];
  if (!page) return null;
  const count = document.extracted_text.length;
  const preview = document.previews?.find((p) => p.number === page.number);
  const checked = document.verification?.pages.find((p) => p.number === page.number);
  const estimate = models.length > 0 && page.tokens !== undefined ? pageEstimate(report, document, page, plan) : null;
  const mark = highlight && highlight.page === page.number ? highlight.box : null;
  const identifiers = document.sensitive.matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => match.page === page.number);
  const hidden = document.content_findings
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) => finding.page === page.number);

  return (
    <aside aria-label="Page" className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="text-sm font-medium">
          Page {page.number} <span className="font-normal text-muted-foreground">of {count}</span>
        </span>
        {count > 1 && (
          <span className="flex">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous page"
              disabled={pageIndex === 0}
              onClick={() => onPick(pageIndex - 1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next page"
              disabled={pageIndex === count - 1}
              onClick={() => onPick(pageIndex + 1)}
            >
              <ChevronRightIcon />
            </Button>
          </span>
        )}
      </div>

      {/* A page with nothing to draw is left out, rather than shown as an empty frame. */}
      {hasPicture(preview) && (
        <div className="h-[min(28rem,55svh)] shrink-0">
          <PagePane number={page.number} name={fileName(document.relative_path)} preview={preview} mark={mark} />
        </div>
      )}

      {checked && checked.status !== "agrees" && (
        <VisionNote page={checked} model={document.verification?.model ?? ""} />
      )}

      {estimate?.read && (
        <p className="flex items-baseline gap-2 text-sm">
          <span className="text-muted-foreground">This page</span>
          <span className="font-medium tabular-nums">{formatPageUsd(estimate.usd)}</span>
          {estimate.seconds !== null && (
            <span className="tabular-nums text-muted-foreground">{formatSeconds(estimate.seconds)}</span>
          )}
        </p>
      )}

      <section aria-label="On this page" className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">On this page</h3>
        {identifiers.length + hidden.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing found.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {hidden.map(({ finding, index }) => (
              <li key={`h${index}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto w-full justify-start gap-2 py-1.5 text-left font-normal"
                  onClick={() => onFinding({ kind: "hidden", index })}
                >
                  <EyeOffIcon className="text-destructive" />
                  <span className="min-w-0 flex-1 truncate">Hidden instruction</span>
                  <ToneBadge tone={severityTone(finding.severity)}>{finding.severity}</ToneBadge>
                </Button>
              </li>
            ))}
            {identifiers.map(({ match, index }) => (
              <li key={`i${index}`}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto w-full justify-start gap-2 py-1.5 text-left font-normal"
                  onClick={() => onFinding({ kind: "identifier", index })}
                >
                  <FlagIcon className="text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {match.label}{" "}
                    <code className="font-mono text-xs text-muted-foreground">
                      {unmasked ? (match.revealed ?? match.masked) : match.masked}
                    </code>
                  </span>
                  <ToneBadge tone={severityTone(match.severity)}>{match.severity}</ToneBadge>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
