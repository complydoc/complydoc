import { ChevronDownIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DocumentDiff } from "@/features/documents/diff/DocumentDiff";
import { usePlan } from "@/hooks/usePlan";
import { KEPT, canReveal, pageText, readersOf } from "@/report/documentDiff";
import { fileName, formatPageUsd, formatSeconds } from "@/report/format";
import { findingHighlight } from "@/report/highlight";
import { pageFindings } from "@/report/pageFindings";
import { hasPicture } from "@/report/picture";
import { documentTotals, pageEstimate } from "@/report/plan";
import type { FindingRef } from "@/report/route";
import type { DocumentEntry, Report } from "@/report/types";
import { useIsIgnored } from "@/hooks/useIgnores";
import { FindingChecklist } from "./FindingChecklist";
import { PagePicker } from "./PagePicker";
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

const COLLAPSED_KEY = "complydoc.page-collapsed";

/** Whether the page's picture is folded away, remembered in this browser across documents. */
function usePageCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, set] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const update = (next: boolean) => {
    set(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Storage refused, as in a private window: it is folded for this visit only.
    }
  };
  return [collapsed, update];
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
  // A finding a link opened is scrolled to by its mark instead.
  const [jump, setJump] = useState<{ page: number } | null>(() =>
    opening !== null && !finding ? { page: opening } : null,
  );
  const revealable = canReveal(document);
  const [eye, setEye] = useState(false);
  const [collapsed, setCollapsed] = usePageCollapsed();
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
  const pictures = (document.previews ?? []).some(hasPicture);
  const column =
    pictures ||
    document.sensitive.matches.length + document.content_findings.length + (document.ignored?.length ?? 0) > 0;
  const priced = models.length > 0 && pages.some((p) => p.tokens !== undefined);
  // The finding a link opened, as it reads in the text on screen.
  const mark = highlight
    ? highlight.kind === "identifier" && unmasked
      ? (highlight.match?.revealed ?? highlight.needle)
      : highlight.needle
    : null;

  // What each page costs and takes to read under the plan, written on its first line.
  const notes: Record<number, string> = {};
  if (priced)
    for (const each of pages) {
      const estimate = pageEstimate(report, document, each, plan);
      if (!estimate.read) continue;
      notes[each.number] = [
        formatPageUsd(estimate.usd),
        ...(estimate.seconds !== null ? [formatSeconds(estimate.seconds)] : []),
      ].join(" · ");
    }
  const totals = priced ? documentTotals(report, document, plan) : null;

  const pick = (next: number) => {
    setPageIndex(next);
    const target = pages[next];
    if (target) setJump({ page: target.number });
  };

  return (
    // Two columns from the top, so the page's picture has the full height beside the text.
    <div className="flex flex-col gap-6 lg:h-[calc(100svh-6rem)] lg:flex-row">
      <div className="flex h-[80svh] min-h-0 min-w-0 flex-1 flex-col gap-3 lg:h-auto">
        <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="min-w-0 truncate font-heading text-lg font-semibold tracking-tight">
            {fileName(document.relative_path)}
          </h2>
          {totals && totals.usd !== null && (
            <span
              className="text-sm text-muted-foreground tabular-nums"
              title="The whole document, under the plan chosen above"
            >
              {formatPageUsd(totals.usd)}
              {totals.seconds !== null && totals.untimed === 0 && ` · ${formatSeconds(totals.seconds)}`}
            </span>
          )}
          <span className="ml-auto self-center">
            <EyeToggle available={revealable} on={unmasked} onChange={setEye} />
          </span>
        </div>
        {compared ? (
          <DocumentDiff
            report={report}
            index={index}
            jump={jump}
            unmasked={unmasked}
            mark={mark}
            notes={notes}
            onVisiblePage={(number) => setPageIndex(pageAt(number))}
          />
        ) : (
          <PageReading
            key={page.number}
            heading={notes[page.number] ? `# Page ${page.number} · ${notes[page.number]}` : `# Page ${page.number}`}
            text={pageText(page, KEPT, unmasked)}
            findings={found.filter((f) => !isIgnored(f))}
            active={active}
          />
        )}
        <div className="flex shrink-0 justify-center">
          <PagePicker count={pages.length} current={pageIndex} onPick={pick} />
        </div>
      </div>

      {column && (
        // Every part in a fixed place, whatever the page holds, so nothing moves when the page
        // changes: the picture takes a set share of the height, and what was found the rest.
        <aside aria-label="Page" className="flex min-h-0 shrink-0 flex-col gap-4 lg:w-80 xl:w-[28rem]">
          {pictures &&
            (collapsed ? (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 justify-between"
                onClick={() => setCollapsed(false)}
                aria-label="Show the page"
              >
                Page {page.number}
                <ChevronDownIcon />
              </Button>
            ) : (
              <div className="h-96 shrink-0 lg:h-[58%]">
                {pictured ? (
                  <PagePane
                    number={page.number}
                    name={fileName(document.relative_path)}
                    preview={preview}
                    mark={highlight && highlight.page === page.number ? highlight.box : null}
                    onCollapse={() => setCollapsed(true)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                    No picture of page {page.number}
                  </div>
                )}
              </div>
            ))}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {checked && checked.status !== "agrees" && (
              <VisionNote page={checked} model={document.verification?.model ?? ""} />
            )}
            <FindingChecklist findings={found} active={active} />
          </div>
        </aside>
      )}
    </div>
  );
}
