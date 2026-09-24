import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { Section } from "@/components/Section";
import { Stat, StatGrid } from "@/components/Stat";
import { ToneBadge } from "@/components/ToneBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fileName, formatCount, formatPageUsd, formatPercent } from "@/report/format";
import { documentHref } from "@/report/route";
import { VERIFICATION_STATUS, unsettledPages } from "@/report/select";
import type { Report, VerificationSummary } from "@/report/types";

const BASIS: Record<VerificationSummary["usd_basis"], string> = {
  actual: "from the provider's token counts",
  estimated: "estimated from the page sizes",
  mixed: "partly estimated",
  unpriced: "no price known for the model",
};

/**
 * The pages a vision model read again, and where its reading and the kept one
 * part company. Every row opens its page with both readings side by side.
 */
export function VerificationSection({ report }: { report: Report }) {
  const summary = report.verification;
  if (!summary) return null;
  const pages = unsettledPages(report);
  const clean = summary.pages_disagree === 0 && summary.pages_failed === 0;
  const scope =
    summary.scope === "all"
      ? "every page"
      : "the pages routing flagged, the pages with no usable reading, and the pages two readers disagreed about";

  return (
    <Section title="Vision check" aside={summary.model}>
      <div className="flex flex-col gap-4">
        <Alert role="status" className={clean ? "border-success/40 bg-success-soft" : undefined}>
          {clean ? <CircleCheckIcon className="text-success" /> : <CircleAlertIcon />}
          <AlertTitle className="text-base">{summary.headline}</AlertTitle>
          <AlertDescription>
            Read again from the page images: {scope}. A page agrees when the kept reading holds{" "}
            {formatPercent(summary.min_coverage)} of the words the model read, in any order.
          </AlertDescription>
        </Alert>

        <StatGrid>
          <Stat label="Pages checked" value={formatCount(summary.pages_checked)} note={`of ${formatCount(summary.pages_total)}`} />
          <Stat label="Disagree" value={formatCount(summary.pages_disagree)} />
          <Stat label="Only vision could read" value={formatCount(summary.pages_filled)} />
          <Stat label="Cost of the reads" value={formatPageUsd(summary.usd)} note={BASIS[summary.usd_basis]} />
        </StatGrid>

        {pages.length > 0 && (
          <Table>
            <TableCaption className="sr-only">Pages the vision check did not agree with</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead className="text-right">Page</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">Words matched</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>What the kept reading lacks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((page) => (
                <TableRow key={`${page.index}-${page.number}`}>
                  <TableCell>
                    <Button variant="link" className="h-auto p-0" asChild>
                      <a href={documentHref(page.index, page.number)} title={page.path}>
                        {fileName(page.path)}
                      </a>
                    </Button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{page.number}</TableCell>
                  <TableCell>
                    <ToneBadge tone={VERIFICATION_STATUS[page.status].tone}>{VERIFICATION_STATUS[page.status].label}</ToneBadge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {page.coverage === null ? "–" : formatPercent(page.coverage)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPageUsd(page.cost?.usd ?? null)}</TableCell>
                  <TableCell className="max-w-md whitespace-normal text-muted-foreground">
                    {page.missing
                      ? `“${page.missing}”`
                      : (page.error ?? (page.status === "disagrees" ? "The model read nothing on a page the kept reading has text for." : page.why))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Section>
  );
}
