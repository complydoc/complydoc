import type { DiffKind, KindSummary } from "@/report/diffExplain";

/** Pages listed before the rest are folded into a count. */
const PAGES_SHOWN = 6;

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

function heading(summary: KindSummary, compareName: string): { title: string; detail: string } {
  const { count } = summary;
  const titles: Record<DiffKind, { title: string; detail: string }> = {
    numbers: { title: "Numbers changed", detail: plural(count, "number") },
    missing: { title: `Missing from ${compareName}`, detail: plural(count, "word") },
    characters: { title: "Characters misread", detail: plural(count, "word") },
    joined: { title: "Words run together", detail: plural(count, "word") },
    order: { title: "Read in another order", detail: `${plural(count, "word")} moved` },
    added: { title: `Only in ${compareName}`, detail: plural(count, "word") },
    spacing: { title: "Line breaks only", detail: "same words" },
  };
  return titles[summary.kind];
}

interface DiffSummaryProps {
  summaries: KindSummary[];
  compareName: string;
  onPage: (page: number) => void;
}

/**
 * What kind of differences the diff below holds, worst first, each with the pages it is
 * on: a number read wrong matters more than a paragraph broken somewhere new. Opened from
 * the diff's Explain button.
 */
export function DiffSummary({ summaries, compareName, onPage }: DiffSummaryProps) {
  // The diff's own header says when the two read the same.
  if (!summaries.length) return null;
  return (
    <ul aria-label="What differs" className="flex flex-col gap-1.5 px-1 pb-3 text-sm">
      {summaries.map((summary) => {
        const { title, detail } = heading(summary, compareName);
        const hidden = summary.pages.length - PAGES_SHOWN;
        return (
          <li key={summary.kind} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium">{title}</span>
            <span className="text-muted-foreground">{detail}</span>
            {summary.examples.map(([from, to]) => (
              <span
                key={`${from}\u0000${to}`}
                className="max-w-full truncate rounded bg-muted px-1.5 font-mono text-xs"
                title={`${from} → ${to}`}
              >
                {from} → {to}
              </span>
            ))}
            <span className="flex flex-wrap items-baseline gap-x-1 text-muted-foreground">
              {summary.pages.length === 1 ? "page" : "pages"}
              {summary.pages.slice(0, PAGES_SHOWN).map((page) => (
                <button
                  key={page}
                  type="button"
                  className="text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                  onClick={() => onPage(page)}
                >
                  {page}
                </button>
              ))}
              {hidden > 0 && <span>and {hidden} more</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
