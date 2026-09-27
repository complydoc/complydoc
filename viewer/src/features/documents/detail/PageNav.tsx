import { cn } from "@/lib/utils";
import type { PageFinding } from "@/report/pageFindings";
import type { Severity } from "@/report/types";

const DOT: Record<Severity, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground/60",
};

interface PageNavProps {
  pages: number[];
  current: number;
  /** The document's findings still open, to show which pages hold some. */
  findings: PageFinding[];
  onPick: (page: number) => void;
}

/**
 * The document's pages down the side, the one being read marked, and a dot of the most
 * serious finding's colour on each page that holds any, with how many.
 */
export function PageNav({ pages, current, findings, onPick }: PageNavProps) {
  if (pages.length < 2) return null;
  const byPage = new Map<number, PageFinding[]>();
  for (const finding of findings)
    if (finding.page !== null) byPage.set(finding.page, [...(byPage.get(finding.page) ?? []), finding]);

  return (
    <nav aria-label="Pages" className="hidden w-28 shrink-0 overflow-y-auto lg:block">
      <ol className="flex flex-col gap-0.5">
        {pages.map((number) => {
          const found = byPage.get(number) ?? [];
          const worst = (["high", "medium", "low"] as const).find((s) => found.some((f) => f.severity === s));
          return (
            <li key={number}>
              <button
                type="button"
                onClick={() => onPick(number)}
                aria-current={number === current ? "page" : undefined}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-muted-foreground tabular-nums transition-colors hover:bg-muted hover:text-foreground",
                  number === current && "bg-muted font-medium text-foreground",
                )}
              >
                <span>Page {number}</span>
                {worst && (
                  <span className="flex items-center gap-1 text-xs" title={`${found.length} found on page ${number}`}>
                    <span className={cn("size-1.5 rounded-full", DOT[worst])} aria-hidden="true" />
                    {found.length}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
