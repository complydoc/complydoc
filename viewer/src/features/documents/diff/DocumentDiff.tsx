import { ArrowLeftRightIcon, ArrowRightIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePlan } from "@/hooks/usePlan";
import { KEPT, OCR, defaultSides, readersOf, sideName, sideText, type Layout, type Side } from "@/report/documentDiff";
import { formatPageUsd, formatSeconds } from "@/report/format";
import { documentTotals, type ReaderChoice } from "@/report/plan";
import type { Report } from "@/report/types";

const GitDiff = lazy(() => import("./GitDiff"));

/** The plan's name for a reading the diff can show. */
function asPlanReader(reader: string): ReaderChoice {
  if (reader === KEPT) return "kept";
  if (reader === OCR) return "ocr";
  return `reader:${reader}`;
}

interface ReaderPickerProps {
  label: string;
  report: Report;
  index: number;
  reader: string;
  onChange: (reader: string) => void;
}

/**
 * One side of the diff: which reader's extraction of this document, and what
 * sending all of it on to the chosen model costs, and took to read where timed.
 */
function ReaderPicker({ label, report, index, reader, onChange }: ReaderPickerProps) {
  const { plan } = usePlan();
  const document = report.documents[index];
  const readers = document ? readersOf(report, document) : [];
  const totals = document ? documentTotals(report, document, { ...plan, reader: asPlanReader(reader) }) : null;
  return (
    <span className="flex items-center gap-2">
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
      {totals && totals.usd !== null && (
        <span
          className="text-xs tabular-nums text-muted-foreground"
          title={`The whole document as this reader extracted it, on ${plan.text?.name ?? "the chosen model"}`}
        >
          {formatPageUsd(totals.usd)}
          {/* "~" is a loader's total spread over its pages rather than each page timed. */}
          {totals.seconds !== null &&
            totals.untimed === 0 &&
            ` · ${totals.averaged ? "~" : ""}${formatSeconds(totals.seconds)}`}
        </span>
      )}
    </span>
  );
}

interface DocumentDiffProps {
  report: Report;
  index: number;
  /** A page to scroll to, asked for by the page picker. */
  jump?: { page: number } | null;
  /** Called with the page at the top of the diff as it scrolls. */
  onVisiblePage?: (page: number) => void;
}

/**
 * This document as one extraction method read it against another, as a git
 * diff: the text layer against another library, OCR or a vision model.
 */
export function DocumentDiff({ report, index, jump = null, onVisiblePage }: DocumentDiffProps) {
  const [[base, compare], setSides] = useState<[Side, Side]>(() => defaultSides(report, index));
  const [split, setSplit] = useState(true);
  const [layout, setLayout] = useState<Layout>("sentences");

  return (
    // Takes whatever height its parent leaves, and gives all of it but the controls to the text.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* One row, so the text below gets the height. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
        <ReaderPicker
          label="Base reader"
          report={report}
          index={index}
          reader={base.reader}
          onChange={(reader) => setSides([{ ...base, reader }, compare])}
        />
        <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <ReaderPicker
          label="Compare reader"
          report={report}
          index={index}
          reader={compare.reader}
          onChange={(reader) => setSides([base, { ...compare, reader }])}
        />
        <Button variant="ghost" size="icon-sm" aria-label="Swap" title="Swap" onClick={() => setSides([compare, base])}>
          <ArrowLeftRightIcon />
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={layout}
            aria-label="How lines are laid out"
            onValueChange={(value) => value && setLayout(value as Layout)}
          >
            <ToggleGroupItem value="sentences" title="Each reader's line breaks removed, one sentence per line">
              Sentences
            </ToggleGroupItem>
            <ToggleGroupItem value="lines" title="Lines as each reader broke them">
              Lines as read
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={split ? "split" : "unified"}
            aria-label="Diff view"
            onValueChange={(value) => value && setSplit(value === "split")}
          >
            <ToggleGroupItem value="split">Split</ToggleGroupItem>
            <ToggleGroupItem value="unified">Unified</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <Suspense fallback={<Skeleton className="min-h-0 w-full flex-1 rounded-xl" />}>
        <GitDiff
          oldName={sideName(report, base)}
          oldText={sideText(report, base, layout)}
          newName={sideName(report, compare)}
          newText={sideText(report, compare, layout)}
          split={split}
          jump={jump}
          {...(onVisiblePage && { onVisiblePage })}
        />
      </Suspense>
    </div>
  );
}
