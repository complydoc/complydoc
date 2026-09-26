import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DocumentDiff } from "@/features/documents/diff/DocumentDiff";
import { usePlan } from "@/hooks/usePlan";
import { KEPT, canReveal, pageText, readersOf } from "@/report/documentDiff";
import { fileName } from "@/report/format";
import { findingHighlight } from "@/report/highlight";
import { pageFindings } from "@/report/pageFindings";
import { hasPicture } from "@/report/picture";
import { documentTotals, pageEstimate } from "@/report/plan";
import type { FindingRef } from "@/report/route";
import type { DocumentEntry, Report } from "@/report/types";
import { useIsIgnored } from "@/hooks/useIgnores";
import { DocumentTotals } from "./DocumentTotals";
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
  // The finding a link opened, as it reads in the text on screen.
  const mark = highlight
    ? highlight.kind === "identifier" && unmasked
      ? (highlight.match?.revealed ?? highlight.needle)
      : highlight.needle
    : null;

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
        <span className="ml-auto flex items-center gap-4">
          {priced && (
            <DocumentTotals
              page={pageEstimate(report, document, page, plan)}
              document={documentTotals(report, document, plan)}
            />
          )}
          <EyeToggle available={revealable} on={unmasked} onChange={setEye} />
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        <div className="flex h-[70svh] min-h-0 min-w-0 flex-1 flex-col gap-3 lg:h-auto">
          {compared ? (
            <DocumentDiff
              report={report}
              index={index}
              jump={jump}
              unmasked={unmasked}
              mark={mark}
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
          <div className="flex shrink-0 justify-center">
            <PagePicker count={pages.length} current={pageIndex} onPick={pick} />
          </div>
        </div>

        {column && (
          // As tall as the text beside it: the page takes what the findings below it leave.
          <aside aria-label="Page" className="flex min-h-0 shrink-0 flex-col gap-4 lg:w-80 xl:w-96">
            {pictured && (
              <div className="h-96 min-h-64 shrink-0 lg:h-auto lg:flex-1">
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
            <div className="shrink-0 overflow-y-auto lg:max-h-[45%]">
              <FindingChecklist findings={found} active={active} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
