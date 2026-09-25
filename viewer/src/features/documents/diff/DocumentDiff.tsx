import { ArrowLeftRightIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fileName } from "@/report/format";
import { KEPT, defaultSides, readersOf, sideName, sideText, type Layout, type Side } from "@/report/documentDiff";
import type { Report } from "@/report/types";

const GitDiff = lazy(() => import("./GitDiff"));

interface SidePickerProps {
  label: string;
  report: Report;
  side: Side;
  onChange: (side: Side) => void;
}

/** One side of the diff: which document, and which reader's reading of it. */
function SidePicker({ label, report, side, onChange }: SidePickerProps) {
  const document = report.documents[side.document];
  const readers = document ? readersOf(report, document) : [];
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="w-14 text-sm text-muted-foreground">{label}</span>
      <Select
        value={String(side.document)}
        onValueChange={(value) => onChange({ document: Number(value), reader: KEPT })}
      >
        <SelectTrigger size="sm" aria-label={`${label} document`} className="w-60 max-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {report.documents.map((d, index) => (
              <SelectItem key={d.relative_path} value={String(index)}>
                {fileName(d.relative_path)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={side.reader} onValueChange={(reader) => onChange({ ...side, reader })}>
        <SelectTrigger size="sm" aria-label={`${label} reader`} className="w-48 max-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {readers.map((reader) => (
              <SelectItem key={reader.id} value={reader.id}>
                {reader.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Any reading of any document against any other, as a git diff: this
 * document's text layer against another reader or OCR, or one document
 * against another, such as two versions of a contract.
 */
interface DocumentDiffProps {
  report: Report;
  index: number;
  /** A page to scroll to, asked for by the page picker. */
  jump?: { page: number } | null;
  /** Called with the page at the top of the diff as it scrolls. */
  onVisiblePage?: (page: number) => void;
}

export function DocumentDiff({ report, index, jump = null, onVisiblePage }: DocumentDiffProps) {
  const [[base, compare], setSides] = useState<[Side, Side]>(() => defaultSides(report, index));
  const [split, setSplit] = useState(true);
  const [layout, setLayout] = useState<Layout>("sentences");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <SidePicker label="Base" report={report} side={base} onChange={(side) => setSides([side, compare])} />
          <SidePicker label="Compare" report={report} side={compare} onChange={(side) => setSides([base, side])} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSides([compare, base])}>
            <ArrowLeftRightIcon />
            Swap
          </Button>
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

      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
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
