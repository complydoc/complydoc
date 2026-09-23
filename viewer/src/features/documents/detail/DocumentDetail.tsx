import { useState } from "react";
import { ToneBadge } from "@/components/ToneBadge";
import { Badge } from "@/components/ui/badge";
import { fileName, formatPercent, formatScore, plural } from "@/report/format";
import { findingHighlight } from "@/report/highlight";
import { pageReadings } from "@/report/readings";
import { documentHref, type FindingRef } from "@/report/route";
import { agreementTone, bandOf, bandTone, documentScore, worthCallingReordered } from "@/report/select";
import type { DocumentEntry, Report } from "@/report/types";
import { FindingBanner } from "./FindingBanner";
import { PageComparison } from "./PageComparison";
import { PagePicker } from "./PagePicker";

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
  const score = documentScore(report, document);
  const others = document.extractions.slice(1);
  const readings = page ? pageReadings(page, report.run.extractor) : [];
  const shown = highlight && page && (highlight.page === null || highlight.page === page.number) ? highlight : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 font-heading text-lg font-semibold tracking-tight">{fileName(document.relative_path)}</h2>
        <Badge variant="outline">{document.format.toUpperCase()}</Badge>
        <Badge variant="outline">{plural(document.page_count, "page")}</Badge>
        <ToneBadge tone={bandTone(bandOf(score))}>readiness {formatScore(score)}</ToneBadge>
        {others.map((reading) => (
          <ToneBadge key={reading.extractor} tone={agreementTone(reading.similarity)}>
            {reading.extractor} {formatPercent(reading.similarity)}
            {worthCallingReordered(reading) && " · reordered"}
          </ToneBadge>
        ))}
        <div className="ml-auto flex items-center gap-4">
          <PagePicker count={document.extracted_text.length} current={pageIndex} onPick={setPageIndex} />
          {readings.length > 1 && <p className="text-xs text-muted-foreground">Marked: what the other reading lacks</p>}
        </div>
      </div>

      {shown && <FindingBanner highlight={shown} clearHref={documentHref(index, page?.number)} />}

      {page ? (
        <PageComparison
          // A fresh pair of readings for each page, since pages can have different readers.
          key={page.number}
          number={page.number}
          name={fileName(document.relative_path)}
          readings={readings}
          preview={document.previews?.find((p) => p.number === page.number)}
          highlight={shown}
        />
      ) : (
        <p className="text-muted-foreground">
          This report carries no text for the document. Run the audit with <code>--extracted-text</code>.
        </p>
      )}
    </div>
  );
}
