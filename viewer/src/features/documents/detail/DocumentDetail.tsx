import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DocumentDiff } from "@/features/documents/diff/DocumentDiff";
import { useIsIgnored } from "@/hooks/useIgnores";
import type { InlineMark } from "@/hooks/useInlineMarks";
import { usePlan } from "@/hooks/usePlan";
import { KEPT, canReveal, pageText, readersOf } from "@/report/documentDiff";
import { fileName, formatPageUsd, formatSeconds } from "@/report/format";
import { findingHighlight } from "@/report/highlight";
import { documentFindings, findingFor } from "@/report/pageFindings";
import { hasPicture } from "@/report/picture";
import { documentTotals, pageEstimate } from "@/report/plan";
import type { FindingRef } from "@/report/route";
import type { DocumentEntry, Report } from "@/report/types";
import { FindingPopover } from "./FindingPopover";
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

/** Whether the page's picture is put away, remembered in this browser across documents. */
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

/** A way through the findings in order, like the results of a search. */
function FindingStepper({ at, count, onStep }: { at: number; count: number; onStep: (next: number) => void }) {
  if (count === 0) return <span className="text-sm text-muted-foreground">Nothing found</span>;
  return (
    <span className="flex items-center text-sm text-muted-foreground" role="group" aria-label="Findings">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous finding"
        onClick={() => onStep(at <= 0 ? count - 1 : at - 1)}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="tabular-nums">
        {at < 0 ? `${count} ${count === 1 ? "finding" : "findings"}` : `Finding ${at + 1} of ${count}`}
      </span>
      <Button variant="ghost" size="icon-sm" aria-label="Next finding" onClick={() => onStep((at + 1) % count)}>
        <ChevronRightIcon />
      </Button>
    </span>
  );
}

/**
 * One document. Read more than one way, a diff of two readings; read one way,
 * its pages as read. What was found is marked in the text itself: click a mark
 * for what it is and to ignore it, or step through the marks in order. Beside
 * the text, the page's picture when the report has one, which can be put away
 * to give the text the whole width.
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
  const pages = document.extracted_text;
  const pageAt = (number: number) =>
    Math.max(
      0,
      pages.findIndex((p) => p.number === number),
    );
  const [pageIndex, setPageIndex] = useState(() => (opening === null ? 0 : pageAt(opening)));
  // A page the diff should scroll to. A new object each time, so asking again still scrolls.
  const [jump, setJump] = useState<{ page: number } | null>(() =>
    opening !== null && !finding ? { page: opening } : null,
  );
  const revealable = canReveal(document);
  const [eye, setEye] = useState(false);
  const unmasked = eye && revealable;
  const [collapsed, setCollapsed] = usePageCollapsed();
  const isIgnored = useIsIgnored();
  const { plan, models } = usePlan();

  const findings = useMemo(() => documentFindings(document, unmasked), [document, unmasked]);
  const linked = finding ? findingFor(findings, document, finding) : undefined;
  const [active, setActive] = useState<string | null>(() => linked?.key ?? null);
  const [focus, setFocus] = useState<{ key: string } | null>(() => (linked ? { key: linked.key } : null));
  const [picked, setPicked] = useState<{ key: string; rect: DOMRect } | null>(null);
  const marks = useMemo<InlineMark[]>(
    () => findings.map((f) => ({ key: f.key, needle: f.needle, tone: isIgnored(f) ? "ignored" : f.severity })),
    [findings, isIgnored],
  );
  // The findings to step through: those still open, in page order.
  const open = findings.filter((f) => !isIgnored(f));
  const at = open.findIndex((f) => f.key === active);

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
  const preview = document.previews?.find((p) => p.number === page.number);
  const pictures = (document.previews ?? []).some(hasPicture);
  const verified = document.verification !== null && document.verification !== undefined;
  const checked = document.verification?.pages.find((p) => p.number === page.number);
  const side = pictures || verified;
  const showSide = side && !collapsed;
  const priced = models.length > 0 && pages.some((p) => p.tokens !== undefined);

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
  const step = (next: number) => {
    const target = open[next];
    if (!target) return;
    setActive(target.key);
    setFocus({ key: target.key });
    setPicked(null);
    // Read one way, the text is one page at a time: turn to the finding's page.
    if (!compared && target.page !== null) setPageIndex(pageAt(target.page));
  };
  const onPick = (key: string, rect: DOMRect) => {
    setActive(key);
    setPicked({ key, rect });
  };

  return (
    // Two columns from the top, so the page's picture has the full height beside the text.
    <div className="flex flex-col gap-6 lg:h-[calc(100svh-6rem)] lg:flex-row">
      <div className="flex h-[80svh] min-h-0 min-w-0 flex-col gap-3 lg:h-auto lg:flex-1">
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
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
          <span className="ml-auto flex items-center gap-1">
            <FindingStepper at={at} count={open.length} onStep={step} />
            <EyeToggle available={revealable} on={unmasked} onChange={setEye} />
            {side && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={showSide ? "Hide the page" : "Show the page"}
                title={showSide ? "Hide the page" : "Show the page"}
                onClick={() => setCollapsed(showSide)}
              >
                {showSide ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
              </Button>
            )}
          </span>
        </div>
        {compared ? (
          <DocumentDiff
            report={report}
            index={index}
            jump={jump}
            unmasked={unmasked}
            notes={notes}
            marks={marks}
            active={active}
            focus={focus}
            onPick={onPick}
            onVisiblePage={(number) => setPageIndex(pageAt(number))}
          />
        ) : (
          <PageReading
            key={page.number}
            heading={notes[page.number] ? `# Page ${page.number} · ${notes[page.number]}` : `# Page ${page.number}`}
            text={pageText(page, KEPT, unmasked)}
            marks={marks}
            active={active}
            focus={focus}
            onPick={onPick}
          />
        )}
        <div className="flex shrink-0 justify-center">
          <PagePicker count={pages.length} current={pageIndex} onPick={pick} />
        </div>
      </div>

      {showSide && (
        // The page takes the column's full height; a vision check, when there was one, has a
        // fixed place beneath it, so nothing moves when the page changes.
        <aside aria-label="Page" className="flex min-h-0 shrink-0 flex-col gap-4 lg:w-80 xl:w-[28rem]">
          {pictures && (
            <div className="h-96 min-h-0 shrink-0 lg:h-auto lg:flex-1">
              {hasPicture(preview) ? (
                <PagePane
                  number={page.number}
                  name={fileName(document.relative_path)}
                  preview={preview}
                  mark={highlight && highlight.page === page.number ? highlight.box : null}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  No picture of page {page.number}
                </div>
              )}
            </div>
          )}
          {verified && (
            <div className="shrink-0">
              {checked ? (
                <VisionNote page={checked} model={document.verification?.model ?? ""} />
              ) : (
                <p className="text-sm text-muted-foreground">The vision check did not read this page.</p>
              )}
            </div>
          )}
        </aside>
      )}

      <FindingPopover
        finding={findings.find((f) => f.key === picked?.key) ?? null}
        rect={picked?.rect ?? null}
        onClose={() => setPicked(null)}
      />
    </div>
  );
}
