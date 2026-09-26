/**
 * Two texts as a git diff, drawn by git-diff-view (MIT), the way GitHub draws one.
 *
 * Loaded only when a diff is opened: the library and its stylesheet are the
 * largest thing in the viewer, and most visits never ask for one.
 */
import { generateDiffFile } from "@git-diff-view/file";
import { DiffModeEnum, DiffView, SplitSide } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { FileDiffIcon, FlagIcon, FoldVerticalIcon, UnfoldVerticalIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToneBadge } from "@/components/ToneBadge";
import { Button } from "@/components/ui/button";
import { useIsDark } from "@/hooks/useIsDark";
import { cn } from "@/lib/utils";
import type { LineMark } from "@/report/documentDiff";
import type { FindingRef } from "@/report/route";
import { EVIDENCE, severityTone } from "@/report/select";

export interface GitDiffProps {
  oldName: string;
  oldText: string;
  newName: string;
  newText: string;
  split: boolean;
  /** Findings by the line they are on, each side counting its lines from 1. */
  marks?: { old: Record<number, LineMark[]>; new: Record<number, LineMark[]> };
  /** The finding opened from a link, marked out from the rest. */
  active?: FindingRef | null;
  /** A page to scroll to; a new object each time it is asked for, so asking twice scrolls twice. */
  jump?: { page: number } | null;
  /** A finding to scroll to, the same way. */
  focus?: { ref: FindingRef } | null;
  /** Called with the page whose lines are at the top of the view, as it scrolls. */
  onVisiblePage?: (page: number) => void;
}

const MARKER = /^# Page (\d+)$/;

/** Every `# Page N` line drawn, as its page and element, in order down the view. */
function markers(container: HTMLElement): { page: number; element: Element }[] {
  const found: { page: number; element: Element }[] = [];
  const seen = new Set<number>();
  for (const element of container.querySelectorAll("*")) {
    if (element.childElementCount > 0) continue;
    const match = MARKER.exec(element.textContent?.trim() ?? "");
    // Split view draws each marker twice, once a side; the first is enough.
    if (match && !seen.has(Number(match[1]))) {
      seen.add(Number(match[1]));
      found.push({ page: Number(match[1]), element });
    }
  }
  return found;
}

const refKey = (ref: FindingRef) => `${ref.kind}-${ref.index}`;

function asExtendData(marks: Record<number, LineMark[]>): Record<string, { data: LineMark[] }> {
  return Object.fromEntries(Object.entries(marks).map(([line, found]) => [line, { data: found }]));
}

function hasRef(marks: Record<number, LineMark[]>, ref: FindingRef): boolean {
  return Object.values(marks).some((found) => found.some((m) => m.ref.kind === ref.kind && m.ref.index === ref.index));
}

/** The findings on one line, under it, the way a review comment sits under the line it is about. */
function FindingLine({ found, active }: { found: LineMark[]; active: FindingRef | null | undefined }) {
  return (
    <div className="flex flex-col gap-1 border-y border-border/60 bg-muted/40 px-3 py-1.5 font-sans text-xs">
      {found.map((mark) => {
        const on = active?.kind === mark.ref.kind && active.index === mark.ref.index;
        return (
          <div
            key={refKey(mark.ref)}
            data-finding={refKey(mark.ref)}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-md px-1.5 py-0.5",
              on && "bg-primary/15 ring-1 ring-primary/50",
            )}
          >
            <FlagIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{mark.label}</span>
            <ToneBadge tone={severityTone(mark.severity)}>{mark.severity}</ToneBadge>
            {mark.evidence && (
              <span className="text-muted-foreground">{EVIDENCE.find((e) => e.key === mark.evidence)?.label}</span>
            )}
            <code className="max-w-full truncate font-mono text-muted-foreground">
              {mark.ref.kind === "identifier" ? mark.text : `“${mark.text}”`}
            </code>
            {!mark.placed && <span className="text-faint">on this page; this reader split it or left it out</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One reading, or two that read the same, as numbered lines. The diff library
 * draws nothing where nothing changed, and this is the text to read all the same.
 */
function PlainText({
  text,
  marks,
  active,
}: {
  text: string;
  marks: Record<number, LineMark[]> | undefined;
  active: FindingRef | null | undefined;
}) {
  const lines = text.replace(/\n$/, "").split("\n");
  return (
    <div className="font-mono text-[13px] leading-6" role="list" aria-label="Text">
      {lines.map((line, index) => {
        const number = index + 1;
        const found = marks?.[number];
        const page = MARKER.test(line);
        return (
          <div key={number} role="listitem">
            <div className={cn("flex", page && "bg-muted/60 text-muted-foreground")}>
              <span className="w-12 shrink-0 select-none border-r pr-2 text-right text-muted-foreground tabular-nums">
                {number}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words px-3">{line}</span>
            </div>
            {found && <FindingLine found={found} active={active} />}
          </div>
        );
      })}
    </div>
  );
}

export default function GitDiff({
  oldName,
  oldText,
  newName,
  newText,
  split,
  marks,
  active,
  jump,
  focus,
  onVisiblePage,
}: GitDiffProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const dark = useIsDark();
  const same = oldText === newText;
  const [unfolded, setUnfolded] = useState(false);
  const file = useMemo(() => {
    const diff = generateDiffFile(oldName, oldText, newName, newText, "plaintext", "plaintext");
    diff.initTheme(dark ? "dark" : "light");
    diff.init();
    diff.buildSplitDiffLines();
    diff.buildUnifiedDiffLines();
    return diff;
  }, [oldName, oldText, newName, newText, dark]);
  // Two readings that agree have nothing to put side by side.
  const mode = split && !same ? "split" : "unified";

  // One reading, or two that agree, is read in full: there is nothing to fold away.
  const showAll = unfolded || same;
  useEffect(() => {
    if (showAll) file.onAllExpand(mode);
    else file.onAllCollapse(mode);
  }, [file, mode, showAll]);

  const extendData = useMemo(() => {
    if (!marks) return undefined;
    // Unified shows each unchanged line once, under its new number, so the new side's marks cover it.
    return mode === "split"
      ? { oldFile: asExtendData(marks.old), newFile: asExtendData(marks.new) }
      : { newFile: asExtendData(marks.new) };
  }, [marks, mode]);

  /** Scroll to what `find` returns, unfolding every line first when it is folded away. */
  const scrollToElement = useCallback(
    (find: (container: HTMLElement) => Element | undefined | null) => {
      // The diff draws after it mounts, and again after unfolding, and a redraw can
      // throw the scroll back to the top. So the target is looked for over a few
      // frames, and scrolled to until it has stayed in view. Only once it has had
      // time to draw and is still missing is it taken to be folded away.
      let settled = 0;
      const go = (attempt: number) => {
        const container = scroller.current;
        const element = container ? find(container) : null;
        if (!container || !element) {
          if (attempt === 3 && !showAll) setUnfolded(true);
          if (attempt < 25) setTimeout(() => go(attempt + 1), 60);
          return;
        }
        const top = element.getBoundingClientRect().top - container.getBoundingClientRect().top;
        if (top >= 0 && top < container.clientHeight / 3) {
          settled += 1;
        } else {
          settled = 0;
          // Smooth when asked for on screen; at once when it had to wait, since the text may still be moving.
          container.scrollTo({ top: container.scrollTop + top - 48, behavior: attempt === 0 ? "smooth" : "auto" });
        }
        if (settled < 2 && attempt < 25) setTimeout(() => go(attempt + 1), attempt === 0 ? 400 : 80);
      };
      go(0);
    },
    [showAll],
  );

  useEffect(() => {
    if (jump) scrollToElement((container) => markers(container).find((m) => m.page === jump.page)?.element);
  }, [jump, scrollToElement]);

  useEffect(() => {
    if (focus) scrollToElement((container) => container.querySelector(`[data-finding="${refKey(focus.ref)}"]`));
  }, [focus, scrollToElement]);

  const onScroll = () => {
    if (!onVisiblePage) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const container = scroller.current;
      if (!container) return;
      const edge = container.getBoundingClientRect().top + 48;
      let current: number | null = null;
      for (const marker of markers(container)) {
        if (marker.element.getBoundingClientRect().top <= edge) current = marker.page;
        else break;
      }
      if (current !== null) onVisiblePage(current);
    });
  };

  return (
    // Fills the height it is given: the header keeps its line, and the diff scrolls in the rest.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-4 py-1.5 font-mono text-xs">
        <FileDiffIcon className="size-4 text-muted-foreground" />
        <span className="truncate">
          {same ? (
            oldName
          ) : (
            <>
              {oldName} <span className="text-muted-foreground">→</span> {newName}
            </>
          )}
        </span>
        <span className="ml-auto flex items-center gap-3 tabular-nums">
          {same ? (
            <span className="font-sans text-muted-foreground">
              {oldName === newName ? "One reading" : "No differences: the two read the same, line for line"}
            </span>
          ) : (
            <>
              <span aria-label="Lines changed" className="flex gap-2">
                <span className="text-success">+{file.additionLength}</span>
                <span className="text-destructive">−{file.deletionLength}</span>
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="font-sans"
                onClick={() => setUnfolded((current) => !current)}
                title={showAll ? "Fold the lines both read the same" : "Show the lines both read the same"}
              >
                {showAll ? <FoldVerticalIcon /> : <UnfoldVerticalIcon />}
                {showAll ? "Fold unchanged" : "Show all lines"}
              </Button>
            </>
          )}
        </span>
      </div>
      <div ref={scroller} onScroll={onScroll} data-testid="diff-scroller" className="min-h-0 flex-1 overflow-y-auto">
        {same ? (
          <PlainText text={newText} marks={marks?.new} active={active} />
        ) : (
          <DiffView<LineMark[]>
            diffFile={file}
            diffViewMode={mode === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified}
            diffViewTheme={dark ? "dark" : "light"}
            diffViewWrap
            diffViewHighlight={false}
            diffViewFontSize={13}
            {...(extendData ? { extendData } : {})}
            renderExtendLine={({ data, side }) =>
              // In split view a finding both readings hold would show twice; the new side's is enough.
              mode === "split" &&
              side === SplitSide.old &&
              marks &&
              data.every((m) => hasRef(marks.new, m.ref)) ? null : (
                <FindingLine found={data} active={active} />
              )
            }
          />
        )}
      </div>
    </div>
  );
}
