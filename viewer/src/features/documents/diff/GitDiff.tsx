/**
 * Two texts as a git diff, drawn by git-diff-view (MIT), the way GitHub draws one.
 *
 * Loaded only when a diff is opened: the library and its stylesheet are the
 * largest thing in the viewer, and most visits never ask for one.
 */
import { generateDiffFile } from "@git-diff-view/file";
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { FileDiffIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useIsDark } from "@/hooks/useIsDark";

export interface GitDiffProps {
  oldName: string;
  oldText: string;
  newName: string;
  newText: string;
  split: boolean;
  /** A page to scroll to; a new object each time it is asked for, so asking twice scrolls twice. */
  jump?: { page: number } | null;
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

export default function GitDiff({ oldName, oldText, newName, newText, split, jump, onVisiblePage }: GitDiffProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const dark = useIsDark();
  const file = useMemo(() => {
    const diff = generateDiffFile(oldName, oldText, newName, newText, "plaintext", "plaintext");
    diff.initTheme(dark ? "dark" : "light");
    diff.init();
    diff.buildSplitDiffLines();
    diff.buildUnifiedDiffLines();
    return diff;
  }, [oldName, oldText, newName, newText, dark]);

  const same = file.additionLength === 0 && file.deletionLength === 0;

  const scrollTo = useCallback(
    (page: number) => {
      const go = (unfold: boolean) => {
        const container = scroller.current;
        if (!container) return;
        const marker = markers(container).find((m) => m.page === page);
        if (!marker) {
          // A page with no changes sits inside a folded stretch: unfold everything, then look again.
          if (unfold && (split ? file.hasExpandSplitAll : file.hasExpandUnifiedAll)) {
            file.onAllExpand(split ? "split" : "unified");
            requestAnimationFrame(() => requestAnimationFrame(() => go(false)));
          }
          return;
        }
        const top = marker.element.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTo({ top: container.scrollTop + top - 8, behavior: "smooth" });
      };
      go(true);
    },
    [file, split],
  );

  useEffect(() => {
    if (jump) scrollTo(jump.page);
  }, [jump, scrollTo]);

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
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-4 py-2 font-mono text-xs">
        <FileDiffIcon className="size-4 text-muted-foreground" />
        <span className="truncate">
          {oldName} <span className="text-muted-foreground">→</span> {newName}
        </span>
        <span className="ml-auto flex gap-2 tabular-nums" aria-label="Lines changed">
          <span className="text-success">+{file.additionLength}</span>
          <span className="text-destructive">−{file.deletionLength}</span>
        </span>
      </div>
      {same ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No differences: the two read the same, line for line.
        </p>
      ) : (
        <div
          ref={scroller}
          onScroll={onScroll}
          data-testid="diff-scroller"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <DiffView
            diffFile={file}
            diffViewMode={split ? DiffModeEnum.Split : DiffModeEnum.Unified}
            diffViewTheme={dark ? "dark" : "light"}
            diffViewWrap
            diffViewHighlight={false}
            diffViewFontSize={13}
          />
        </div>
      )}
    </div>
  );
}
