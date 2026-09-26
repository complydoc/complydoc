import { lazy, Suspense, useState } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { defaultSides, readersOf, sideName, sideText, type Side } from "@/report/documentDiff";
import type { Report } from "@/report/types";

const GitDiff = lazy(() => import("./GitDiff"));

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
}

/**
 * This document as one extraction method read it against another, as a git
 * diff: the text layer against another library, OCR or a vision model. One
 * sentence per line, so only the sentences whose words differ show as changed.
 */
export function DocumentDiff({ report, index, jump = null, onVisiblePage, unmasked = false }: DocumentDiffProps) {
  const [[base, compare], setSides] = useState<[Side, Side]>(() => defaultSides(report, index));
  // Side by side where there is room for two columns of text.
  const split = useMediaQuery("(min-width: 80rem)");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
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
      </div>

      <Suspense fallback={<Skeleton className="min-h-0 w-full flex-1 rounded-xl" />}>
        <GitDiff
          oldName={sideName(report, base)}
          oldText={sideText(report, base, "sentences", unmasked)}
          newName={sideName(report, compare)}
          newText={sideText(report, compare, "sentences", unmasked)}
          split={split}
          jump={jump}
          {...(onVisiblePage && { onVisiblePage })}
        />
      </Suspense>
    </div>
  );
}
