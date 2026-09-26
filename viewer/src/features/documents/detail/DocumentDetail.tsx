import { EyeIcon, EyeOffIcon, PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DocumentDiff } from "@/features/documents/diff/DocumentDiff";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePlan } from "@/hooks/usePlan";
import { canReveal } from "@/report/documentDiff";
import { fileName } from "@/report/format";
import { findingHighlight } from "@/report/highlight";
import { documentTotals } from "@/report/plan";
import { documentHref, type FindingRef } from "@/report/route";
import type { DocumentEntry, Report } from "@/report/types";
import { DocumentTotals } from "./DocumentTotals";
import { FindingBanner } from "./FindingBanner";
import { PageSide } from "./PageSide";

interface DocumentDetailProps {
  report: Report;
  document: DocumentEntry;
  /** Position of the document in the report, for links back to it. */
  index: number;
  /** The page to open on, as printed; the first when null. */
  page?: number | null;
  /** A finding to show where it sits. */
  finding?: FindingRef | null;
}

/**
 * Whether the text shows the values. Only a report written with --reveal holds
 * them; it opens masked all the same, since whoever can see the screen can read them.
 */
function EyeToggle({ available, on, onChange }: { available: boolean; on: boolean; onChange: (on: boolean) => void }) {
  const button = (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={on}
      disabled={!available}
      onClick={() => onChange(!on)}
      aria-label={on ? "Mask the values" : "Show the values"}
    >
      {on ? <EyeIcon /> : <EyeOffIcon />}
      {on ? "Values shown" : "Masked"}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button takes no pointer events, so the tooltip hangs on a wrapper. */}
        <span tabIndex={available ? -1 : 0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {available
          ? on
            ? "The text shows each identifier's value. Mask them again before sharing your screen."
            : "Show each identifier's value, which this report holds because it was written with --reveal."
          : "This report holds masked values only. Audit with --reveal to keep the values and show them here; the report then holds them too."}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * One document, read as a diff of two readers' text, with the page it is on
 * beside it: the picture, the vision check, the cost, and what was found there.
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
  // A page or finding the diff should scroll to. A new object each time, so asking again still scrolls.
  const [jump, setJump] = useState<{ page: number } | null>(() =>
    opening !== null && !finding ? { page: opening } : null,
  );
  const [focus, setFocus] = useState<{ ref: FindingRef } | null>(() => (finding ? { ref: finding } : null));
  const revealable = canReveal(document);
  const [unmasked, setUnmasked] = useState(false);
  const wide = useMediaQuery("(min-width: 64rem)");
  // Beside the text on a wide screen; on a narrow one, a sheet opened on request.
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const showPanel = wide && panelOpen;
  const { plan, models } = usePlan();
  const priced = models.length > 0 && document.extracted_text.some((p) => p.tokens !== undefined);

  const pick = (next: number) => {
    setPageIndex(next);
    const target = document.extracted_text[next];
    if (target) setJump({ page: target.number });
  };

  if (document.extracted_text.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold tracking-tight">{fileName(document.relative_path)}</h2>
        <p className="text-muted-foreground">
          This report carries no text for the document. Run the audit with <code>--extracted-text</code>.
        </p>
      </div>
    );
  }

  const side = (
    <PageSide
      report={report}
      document={document}
      pageIndex={pageIndex}
      onPick={pick}
      highlight={highlight}
      onFinding={(ref) => setFocus({ ref })}
      unmasked={unmasked && revealable}
    />
  );

  return (
    // Fills the window below the bar, less the page's own padding: 3rem of bar, and 2rem or 3rem
    // of padding. The text scrolls inside, so the page itself never scrolls past it.
    <div className="flex h-[calc(100svh-5rem)] min-h-[28rem] flex-col gap-4 md:h-[calc(100svh-6rem)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate font-heading text-lg font-semibold tracking-tight">
            {fileName(document.relative_path)}
          </h2>
          {unmasked && revealable && <Badge variant="destructive">Values visible</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {priced && <DocumentTotals document={documentTotals(report, document, plan)} />}
          <EyeToggle available={revealable} on={unmasked && revealable} onChange={setUnmasked} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={showPanel ? "Hide the page" : "Show the page"}
            title={showPanel ? "Hide the page" : "Show the page"}
            onClick={() => (wide ? setPanelOpen((open) => !open) : setSheetOpen(true))}
          >
            {showPanel ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
          </Button>
        </div>
      </div>

      {highlight && <FindingBanner highlight={highlight} clearHref={documentHref(index, highlight.page)} />}

      <div className="flex min-h-0 flex-1 gap-4">
        <DocumentDiff
          report={report}
          index={index}
          jump={jump}
          focus={focus}
          active={finding}
          unmasked={unmasked && revealable}
          onVisiblePage={(number) => setPageIndex(pageAt(number))}
        />
        {showPanel && <div className="w-80 shrink-0 xl:w-96">{side}</div>}
      </div>

      {!wide && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-[min(24rem,92vw)] p-4">
            <SheetHeader className="p-0">
              <SheetTitle>{fileName(document.relative_path)}</SheetTitle>
              <SheetDescription>The page the text above is on.</SheetDescription>
            </SheetHeader>
            {side}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
