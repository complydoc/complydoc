import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentDiff } from "@/features/documents/diff/DocumentDiff";
import { useIsIgnored } from "@/hooks/useIgnores";
import type { InlineFindings, InlineMark } from "@/hooks/useInlineMarks";
import { usePageCollapsed } from "@/hooks/usePageCollapsed";
import { usePlan } from "@/hooks/usePlan";
import { KEPT, canReveal, pageText, readersOf } from "@/report/documentDiff";
import { fileName, formatPageUsd, formatSeconds } from "@/report/format";
import { findingHighlight } from "@/report/highlight";
import { documentFindings, findingFor } from "@/report/pageFindings";
import { hasPicture } from "@/report/picture";
import { documentTotals, pageEstimate } from "@/report/plan";
import type { FindingRef } from "@/report/route";
import type { DocumentEntry, Report } from "@/report/types";
import { EyeToggle, PageStepper } from "./DocumentControls";
import { FindingPopover } from "./FindingPopover";
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
 * One document. Read more than one way, a diff of two readings; read one way,
 * its pages as read. What was found is marked in the text itself: rest on a
 * mark for what it is and to ignore it, or pick one from the rail beside it. To
 * the left of the text, the page's picture when the report has one, which can
 * be put away to give the text the whole width.
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
  // Leaving a mark closes its card after a moment, so the pointer can cross into the card to tick it.
  const closing = useRef(0);
  const cancelClose = () => window.clearTimeout(closing.current);
  const scheduleClose = () => {
    cancelClose();
    closing.current = window.setTimeout(() => setPicked(null), 300);
  };
  // Ignored findings leave the text; the Security page still lists them.
  const marks = useMemo<InlineMark[]>(
    () => findings.filter((f) => !isIgnored(f)).map((f) => ({ key: f.key, needle: f.needle, tone: f.severity })),
    [findings, isIgnored],
  );
  // The findings to step through: those still open, in page order.

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
  const onPick = (key: string, rect: DOMRect) => {
    cancelClose();
    setActive(key);
    setPicked({ key, rect });
  };
  const inline: InlineFindings = {
    marks,
    active,
    focus,
    onPick,
    // Resting on a mark opens its card, like a click, without making it the one in hand.
    onHover: (key, rect) => {
      cancelClose();
      setPicked({ key, rect });
    },
    onLeave: scheduleClose,
    onRail: (key) => {
      setActive(key);
      setFocus({ key });
      setPicked(null);
    },
    label: (key) => {
      const found = findings.find((f) => f.key === key);
      return found ? `${found.label}, ${found.severity}${found.page !== null ? `, page ${found.page}` : ""}` : key;
    },
  };

  const eyeToggle = <EyeToggle available={revealable} on={unmasked} onChange={setEye} />;
  const pager = <PageStepper number={page.number} index={pageIndex} count={pages.length} onPick={pick} />;

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100svh-6rem)]">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
        {side && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={showSide ? "Hide the page" : "Show the page"}
            title={showSide ? "Hide the page" : "Show the page"}
            onClick={() => setCollapsed(showSide)}
          >
            {showSide ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
          </Button>
        )}
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
        {/* Read one way, there is no readers' row: the eye and the pages sit here, right above the text. */}
        {!compared && (
          <span className="ml-auto flex items-center gap-3">
            {eyeToggle}
            {pager}
          </span>
        )}
      </div>

      {/* The page on the left and the text on the right, each as tall as the space below the title. */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
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

        <div className="flex h-[80svh] min-h-0 min-w-0 flex-col gap-3 lg:h-auto lg:flex-1">
          {compared ? (
            <DocumentDiff
              report={report}
              index={index}
              jump={jump}
              unmasked={unmasked}
              notes={notes}
              inline={inline}
              controls={eyeToggle}
              end={pager}
              onVisiblePage={(number) => setPageIndex(pageAt(number))}
            />
          ) : (
            <PageReading
              key={page.number}
              heading={notes[page.number] ? `# Page ${page.number} · ${notes[page.number]}` : `# Page ${page.number}`}
              text={pageText(page, KEPT, unmasked)}
              inline={inline}
            />
          )}
        </div>
      </div>

      <FindingPopover
        finding={findings.find((f) => f.key === picked?.key) ?? null}
        rect={picked?.rect ?? null}
        onClose={() => setPicked(null)}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
      />
    </div>
  );
}
