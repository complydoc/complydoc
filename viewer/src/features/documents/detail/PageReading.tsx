import { findAll } from "@/report/highlight";
import type { PageFinding } from "@/report/pageFindings";
import { cn } from "@/lib/utils";

interface PageReadingProps {
  text: string;
  /** Findings to mark where they sit in the text. */
  findings: PageFinding[];
  active: string | null;
  /** The page's first line: its number, and what it costs to read. */
  heading: string;
}

/** Long enough to be found only where it is; short enough to survive a line break the reader added. */
const PASSAGE_START = 40;

/** One page's text, as read, with what was found on it marked. */
export function PageReading({ text, findings, active, heading }: PageReadingProps) {
  const ranges: { start: number; end: number; key: string }[] = [];
  for (const finding of findings) {
    const needle = finding.kind === "hidden" ? finding.value.replace(/…$/, "").slice(0, PASSAGE_START) : finding.value;
    for (const [start, end] of findAll(text, needle)) ranges.push({ start, end, key: finding.key });
  }
  ranges.sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const range of ranges) {
    if (range.start < at) continue;
    parts.push(text.slice(at, range.start));
    parts.push(
      <mark
        key={`${range.key}-${range.start}`}
        data-finding={range.key}
        className={cn(
          "rounded-sm bg-warning-soft px-0.5 text-foreground",
          active === range.key && "bg-primary/25 ring-1 ring-primary",
        )}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    at = range.end;
  }
  parts.push(text.slice(at));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card px-5 py-4" data-testid="page-reading">
      <p className="mb-3 font-mono text-xs text-muted-foreground">{heading}</p>
      {text.trim() ? (
        <p className="whitespace-pre-wrap text-sm leading-6">{parts}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing was read on this page.</p>
      )}
    </div>
  );
}
