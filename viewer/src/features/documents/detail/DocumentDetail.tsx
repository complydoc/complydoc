import { useState } from "react";
import { usePlan } from "@/hooks/usePlan";
import { documentTotals, pageEstimate } from "@/report/plan";
import { fileName } from "@/report/format";
import { findingHighlight } from "@/report/highlight";
import { pageReadings } from "@/report/readings";
import { documentHref, type FindingRef } from "@/report/route";
import type { DocumentEntry, Report } from "@/report/types";
import { FindingBanner } from "./FindingBanner";
import { PageComparison } from "./PageComparison";
import { PagePicker } from "./PagePicker";
import { DocumentTotals } from "./DocumentTotals";
import { VisionNote } from "./VisionNote";

interface DocumentDetailProps {
  report: Report;
  document: DocumentEntry;
  /** Position of the document in the report, for links back to it. */
  index: number;
  /** The page to open on, as printed; the first when null. */
  page?: number | null;
  /** A finding to show on its page. */
  finding?: FindingRef | null;
}

/** One document: every reader's reading of each page, beside the page itself, and a finding shown where it sits. */
export function DocumentDetail({ report, document, index, page: startPage = null, finding = null }: DocumentDetailProps) {
  const highlight = finding ? findingHighlight(document, finding) : null;
  const opening = highlight?.page ?? startPage;
  const [pageIndex, setPageIndex] = useState(() =>
    Math.max(0, document.extracted_text.findIndex((p) => p.number === opening)),
  );
  const page = document.extracted_text[pageIndex];
  const pages = document.extracted_text.length;
  const readings = page ? pageReadings(page, report.run.extractor) : [];
  const shown = highlight && page && (highlight.page === null || highlight.page === page.number) ? highlight : null;
  const { plan, models } = usePlan();
  // A report written before pages carried token counts has nothing to price them by.
  const priced = page && models.length > 0 && page.tokens !== undefined;
  const checked = page ? document.verification?.pages.find((p) => p.number === page.number) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight">{fileName(document.relative_path)}</h2>
        {priced && (
          <DocumentTotals
            page={pageEstimate(report, document, page, plan)}
            document={documentTotals(report, document, plan)}
          />
        )}
      </div>

      {shown && <FindingBanner highlight={shown} clearHref={documentHref(index, page?.number)} />}
      {checked && checked.status !== "agrees" && <VisionNote page={checked} model={document.verification?.model ?? ""} />}

      {page ? (
        <PageComparison
          // A fresh pair of readings for each page, since pages can have different readers.
          key={page.number}
          number={page.number}
          name={fileName(document.relative_path)}
          readings={readings}
          preview={document.previews?.find((p) => p.number === page.number)}
          highlight={shown}
          // Room below for the page picker, when there is more than one page.
          reserve={pages > 1}
          pricing={priced ? { page, text: plan.text, vision: plan.vision } : null}
        />
      ) : (
        <p className="text-muted-foreground">
          This report carries no text for the document. Run the audit with <code>--extracted-text</code>.
        </p>
      )}

      <div className="flex justify-center">
        <PagePicker count={pages} current={pageIndex} onPick={setPageIndex} />
      </div>
    </div>
  );
}
