import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DocumentDiff } from "@/features/documents/diff/DocumentDiff";
import { usePlan } from "@/hooks/usePlan";
import { KEPT, canReveal, pageText, readersOf } from "@/report/documentDiff";
import { fileName, formatPageUsd } from "@/report/format";
import { findingHighlight } from "@/report/highlight";
import { pageFindings } from "@/report/pageFindings";
import { hasPicture } from "@/report/picture";
import { documentTotals } from "@/report/plan";
import type { FindingRef } from "@/report/route";
import type { DocumentEntry, Report } from "@/report/types";
import { useIsIgnored } from "@/hooks/useIgnores";
import { FindingChecklist } from "./FindingChecklist";
import { PagePane } from "./PagePane";
import { PageReading } from "./PageReading";
import { VisionNote } from "./VisionNote";

interface DocumentDetailProps {
  report: Report;
  document: DocumentEntry;
  /** Position of the document in the report, for links back to it. */
  index: number;
  /** The page to open on, as printed; the first when null. */
  page?: number | null;
  /** A finding to open on, marked out from the rest. */
  finding?: FindingRef | null;
}

/**
 * Whether the text shows the values. Only a report written with --reveal holds
 * them; it opens masked all the same, since whoever can see the screen can read them.
 */
function EyeToggle({ available, on, onChange }: { available: boolean; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button takes no pointer events, so the tooltip hangs on a wrapper. */}
        <span tabIndex={available ? -1 : 0}>
          <Button
            variant={on ? "secondary" : "ghost"}
            size="icon-sm"
            aria-pressed={on}
            disabled={!available}
            onClick={() => onChange(!on)}
            aria-label={on ? "Mask the values" : "Show the values"}
          >
            {on ? <EyeIcon /> : <EyeOffIcon />}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {available
          ? on
            ? "Showing each identifier's value. Mask them again before sharing your screen."
            : "Show each identifier's value. This report holds them because it was written with --reveal."
          : "Values are masked. Audit with --reveal to keep them and show them here."}
      </TooltipContent>
    </Tooltip>
  );
}

function Pager({
  number,
  index,
  count,
  onPick,
}: {
  number: number;
  index: number;
  count: number;
  onPick: (i: number) => void;
}) {
  return (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous page"
        disabled={index === 0}
        onClick={() => onPick(index - 1)}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="tabular-nums">
        Page {number} of {count}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next page"
        disabled={index === count - 1}
        onClick={() => onPick(index + 1)}
      >
        <ChevronRightIcon />
      </Button>
    </span>
  );
}

/**
 * One document. Read more than one way, a diff of two readings; read one way,
 * its pages as read. Beside it, the page's picture when the report has one, and
 * what was found on the page, each finding with a box to tick it off.
 */
export function DocumentDetail({
  report,
  document,
  index,
  page: startPage = null,
  finding = null,
}: DocumentDetailProps) {
  const highlight = finding ? findingHighlight(document, finding) : null;
  const opening = highlight?.page ?? startPage;
  const pageAt = (number: number) =>
    Math.max(
      0,
      document.extracted_text.findIndex((p) => p.number === number),
    );
  const [pageIndex, setPageIndex] = useState(() => (opening === null ? 0 : pageAt(opening)));
  // A page the diff should scroll to. A new object each time, so asking again still scrolls.
  const [jump, setJump] = useState<{ page: number } | null>(() => (opening !== null ? { page: opening } : null));
  const revealable = canReveal(document);
  const [eye, setEye] = useState(false);
  const unmasked = eye && revealable;
  const isIgnored = useIsIgnored();
  const { plan, models } = usePlan();

  const pages = document.extracted_text;
  const page = pages[pageIndex];
  if (!page) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold tracking-tight">{fileName(document.relative_path)}</h2>
        <p className="text-muted-foreground">
          This report carries no text for the document. Run the audit with <code>--extracted-text</code>.
        </p>
      </div>
    );
  }

  const compared = readersOf(report, document).length > 1;
  const found = pageFindings(document, page.number, unmasked);
  const active = finding ? `${finding.kind}-${finding.index}` : null;
  const preview = document.previews?.find((p) => p.number === page.number);
  const pictured = hasPicture(preview);
  const checked = document.verification?.pages.find((p) => p.number === page.number);
  // The column is kept for every page once any page needs it, so the text does not jump sideways.
  const column =
    (document.previews ?? []).some(hasPicture) ||
    document.sensitive.matches.length + document.content_findings.length + (document.ignored?.length ?? 0) > 0;
  const priced = models.length > 0 && pages.some((p) => p.tokens !== undefined);
  const totals = priced ? documentTotals(report, document, plan) : null;

  const pick = (next: number) => {
    setPageIndex(next);
    const target = pages[next];
    if (target) setJump({ page: target.number });
  };

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100svh-6rem)]">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="min-w-0 truncate font-heading text-lg font-semibold tracking-tight">
          {fileName(document.relative_path)}
        </h2>
        {pages.length > 1 && <Pager number={page.number} index={pageIndex} count={pages.length} onPick={pick} />}
        <span className="ml-auto flex items-center gap-3">
          {totals && totals.usd !== null && (
            <span className="text-sm text-muted-foreground" title="The whole document, under the plan chosen above">
              {formatPageUsd(totals.usd)} to read
            </span>
          )}
          <EyeToggle available={revealable} on={unmasked} onChange={setEye} />
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        <div className="flex h-[70svh] min-h-0 min-w-0 flex-1 flex-col lg:h-auto">
          {compared ? (
            <DocumentDiff
              report={report}
              index={index}
              jump={jump}
              unmasked={unmasked}
              onVisiblePage={(number) => setPageIndex(pageAt(number))}
            />
          ) : (
            <PageReading
              key={page.number}
              text={pageText(page, KEPT, unmasked)}
              findings={found.filter((f) => !isIgnored(f))}
              active={active}
            />
          )}
        </div>

        {column && (
          <aside aria-label="Page" className="flex min-h-0 shrink-0 flex-col gap-4 overflow-y-auto lg:w-80">
            {pictured && (
              <div className="h-96 shrink-0">
                <PagePane
                  number={page.number}
                  name={fileName(document.relative_path)}
                  preview={preview}
                  mark={highlight && highlight.page === page.number ? highlight.box : null}
                />
              </div>
            )}
            {checked && checked.status !== "agrees" && (
              <VisionNote page={checked} model={document.verification?.model ?? ""} />
            )}
            <FindingChecklist findings={found} active={active} />
          </aside>
        )}
      </div>
    </div>
  );
}
