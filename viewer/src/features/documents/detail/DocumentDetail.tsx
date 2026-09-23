import { useState } from "react";
import { ToneBadge } from "@/components/ToneBadge";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { fileName, formatPercent, formatScore, plural } from "@/report/format";
import { pageReadings } from "@/report/readings";
import { agreementTone, bandOf, bandTone, documentScore, worthCallingReordered } from "@/report/select";
import type { DocumentEntry, Report } from "@/report/types";
import { PageComparison } from "./PageComparison";
import { PagePicker } from "./PagePicker";

interface DocumentDetailProps {
  report: Report;
  document: DocumentEntry;
}

/** One document: every reader's reading of each page, beside the page itself. */
export function DocumentDetail({ report, document }: DocumentDetailProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const page = document.extracted_text[pageIndex];
  const score = documentScore(report, document);
  const others = document.extractions.slice(1);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#documents">Documents</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{fileName(document.relative_path)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <PagePicker count={document.extracted_text.length} current={pageIndex} onPick={setPageIndex} />
        <p className="ml-auto text-xs text-muted-foreground">Marked: what the other reading lacks</p>
      </div>

      {page ? (
        <PageComparison
          // A fresh pair of readings for each page, since pages can have different readers.
          key={page.number}
          readings={pageReadings(page, report.run.extractor)}
          preview={document.previews?.find((p) => p.number === page.number)}
        />
      ) : (
        <p className="text-muted-foreground">
          This report carries no text for the document. Run the audit with <code>--extracted-text</code>.
        </p>
      )}
    </div>
  );
}
