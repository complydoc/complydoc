import { formatPageUsd, formatSeconds } from "@/report/format";
import type { PageEstimate, Totals } from "@/report/plan";

function Figure({ label, usd, seconds, note }: { label: string; usd: number | null; seconds: number | null; note?: string }) {
  return (
    <span className="flex items-baseline gap-2" title={note}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{formatPageUsd(usd)}</span>
      {/* A reader nothing timed has no time to show, which is said nowhere better than by leaving it out. */}
      {seconds !== null && <span className="tabular-nums text-muted-foreground">{formatSeconds(seconds)}</span>}
    </span>
  );
}

/** What this page and the whole document cost and take to read, under the plan chosen above. */
export function DocumentTotals({ page, document }: { page: PageEstimate; document: Totals }) {
  const untimed = document.untimed > 0 ? `${document.untimed} of ${document.pages} pages were not timed` : undefined;
  return (
    <div role="group" aria-label="Cost and time" className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
      <Figure label="This page" usd={page.usd} seconds={page.seconds} />
      <Figure label="Document" usd={document.usd} seconds={document.seconds} {...(untimed ? { note: untimed } : {})} />
    </div>
  );
}
