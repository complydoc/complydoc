import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { InlineFindings } from "@/hooks/useInlineMarks";
import { defaultSides, readersOf, sideName, sideText, type Side } from "@/report/documentDiff";
import type { Report } from "@/report/types";

const GitDiff = lazy(() => import("./GitDiff"));

/** The width, in pixels, below which two columns of text are too narrow to read side by side. */
const SPLIT_WIDTH = 880;

interface ReaderPickerProps {
  label: string;
  report: Report;
  index: number;
  reader: string;
  onChange: (reader: string) => void;
}

/** One side of the diff: which reader's extraction of this document. */
function ReaderPicker({ label, report, index, reader, onChange }: ReaderPickerProps) {
  const document = report.documents[index];
  const readers = document ? readersOf(report, document) : [];
  return (
    <Select value={reader} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {readers.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

interface DocumentDiffProps {
  report: Report;
  index: number;
  /** A page to scroll to, asked for by the page picker. */
  jump?: { page: number } | null;
  /** Called with the page at the top of the diff as it scrolls. */
  onVisiblePage?: (page: number) => void;
  /** Show the values, where the report holds them. */
  unmasked?: boolean;
  /** Findings to mark where they sit in the text. */
  inline?: InlineFindings;
  /** A few words after each page's `# Page N` line, such as what the page costs. */
  notes?: Record<number, string>;
}

/**
 * This document as one extraction method read it against another, as a git
 * diff: the text layer against another library, OCR or a vision model. One
 * sentence per line, so only the sentences whose words differ show as changed.
 */
export function DocumentDiff({
  report,
  index,
  jump = null,
  onVisiblePage,
  unmasked = false,
  inline,
  notes = {},
}: DocumentDiffProps) {
  const [[base, compare], setSides] = useState<[Side, Side]>(() => defaultSides(report, index));
  // Side by side where the diff itself has room for two columns of text, whatever sits beside it.
  const root = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setSplit((entry?.contentRect.width ?? 0) >= SPLIT_WIDTH));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={root} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Suspense fallback={<Skeleton className="min-h-0 w-full flex-1 rounded-xl" />}>
        <GitDiff
          oldName={sideName(report, base)}
          oldText={sideText(report, base, "sentences", unmasked, notes)}
          newName={sideName(report, compare)}
          newText={sideText(report, compare, "sentences", unmasked, notes)}
          split={split}
          jump={jump}
          {...(inline && { inline })}
          {...(onVisiblePage && { onVisiblePage })}
          lead={
            // The two readings set side by side head the diff, as the page heads the picture.
            <span className="flex items-center gap-2 text-sm text-foreground">
              <ReaderPicker
                label="Base reader"
                report={report}
                index={index}
                reader={base.reader}
                onChange={(reader) => setSides([{ ...base, reader }, compare])}
              />
              <span className="text-muted-foreground">vs</span>
              <ReaderPicker
                label="Compare reader"
                report={report}
                index={index}
                reader={compare.reader}
                onChange={(reader) => setSides([base, { ...compare, reader }])}
              />
            </span>
          }
        />
      </Suspense>
    </div>
  );
}
