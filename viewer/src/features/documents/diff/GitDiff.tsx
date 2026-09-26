/**
 * Two texts as a git diff, drawn by git-diff-view (MIT), the way GitHub draws one.
 *
 * Loaded only when a diff is opened: the library and its stylesheet are the
 * largest thing in the viewer, and most visits never ask for one.
 */
import { generateDiffFile } from "@git-diff-view/file";
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { FoldVerticalIcon, UnfoldVerticalIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
  /** Text to mark wherever it is drawn, and scroll to: a finding opened from a link. */
  mark?: string | null;
}

/** The name the marked finding is styled by, in index.css. */
const HIGHLIGHT = "complydoc-finding";

/**
 * Where `needle` sits in the text drawn inside `container`, spacing aside, as
 * ranges over its text nodes. The diff splits a line into several nodes where
 * words changed, so the text is searched whole and each match mapped back.
 */
function textRanges(container: HTMLElement, needle: string): Range[] {
  const words = needle.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const nodes: { node: Text; start: number }[] = [];
  let text = "";
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: text.length });
    text += node.textContent ?? "";
  }
  const at = (offset: number) => {
    let found = nodes[0];
    for (const entry of nodes) {
      if (entry.start > offset) break;
      found = entry;
    }
    return found ? { node: found.node, offset: offset - found.start } : null;
  };
  const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "g");
  const ranges: Range[] = [];
  for (const match of text.matchAll(pattern)) {
    const start = at(match.index);
    const end = at(match.index + match[0].length);
    if (!start || !end) continue;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    ranges.push(range);
  }
  return ranges;
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

/** Two readings that agree have no diff to draw, so their text is shown as it is. */
function SameText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-6">
      {text
        .replace(/\n$/, "")
        .split("\n")
        .map((line, index) =>
          MARKER.test(line) ? (
            <p key={index} className="mt-4 mb-1 text-xs font-medium text-muted-foreground first:mt-0">
              {line}
            </p>
          ) : (
            <p key={index}>{line}</p>
          ),
        )}
    </div>
  );
}

export default function GitDiff({
  oldName,
  oldText,
  newName,
  newText,
  split,
  jump,
  onVisiblePage,
  mark = null,
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
  const mode = split ? "split" : "unified";

  useEffect(() => {
    if (unfolded) file.onAllExpand(mode);
    else file.onAllCollapse(mode);
  }, [file, mode, unfolded]);

  /** Scroll to a page's marker, unfolding every line first when it is folded away. */
  const scrollTo = useCallback(
    (page: number) => {
      // The diff draws after it mounts, and again after unfolding, so the marker
      // is looked for over a few frames before it is taken to be folded away.
      const go = (attempt: number) => {
        const container = scroller.current;
        const marker = container ? markers(container).find((m) => m.page === page) : undefined;
        if (!container || !marker) {
          if (attempt === 3 && !unfolded) setUnfolded(true);
          if (attempt < 20) setTimeout(() => go(attempt + 1), 60);
          return;
        }
        const top = marker.element.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTo({ top: container.scrollTop + top - 8, behavior: attempt === 0 ? "smooth" : "auto" });
      };
      go(0);
    },
    [unfolded],
  );

  useEffect(() => {
    if (jump) scrollTo(jump.page);
  }, [jump, scrollTo]);

  // The finding a link opened, marked where it is drawn. The mark is a CSS
  // highlight over text ranges, so the diff's own elements are never touched, and
  // it is laid again whenever the diff redraws, as it does on unfolding.
  const markedOnce = useRef<string | null>(null);
  useEffect(() => {
    const container = scroller.current;
    if (!mark || !container || typeof CSS === "undefined" || !("highlights" in CSS)) return;
    let attempts = 0;
    let timer = 0;
    const lay = () => {
      const ranges = textRanges(container, mark);
      CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));
      const first = ranges[0];
      if (first && markedOnce.current !== mark) {
        markedOnce.current = mark;
        const top = first.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTo({ top: container.scrollTop + top - container.clientHeight / 3 });
      }
      // Not drawn yet, or folded away: look again, and unfold once it has had time to draw.
      if (!first && attempts < 20) {
        attempts += 1;
        if (attempts === 4) setUnfolded(true);
        timer = window.setTimeout(lay, 80);
      }
    };
    lay();
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lay, 50);
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      CSS.highlights.delete(HIGHLIGHT);
    };
  }, [mark, file, mode]);

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex shrink-0 items-center gap-3 border-b px-3 py-1 text-xs text-muted-foreground">
        {same ? (
          <span>The two read the same</span>
        ) : (
          <>
            <span aria-label="Lines changed" className="flex gap-2 font-mono tabular-nums">
              <span className="text-success">+{file.additionLength}</span>
              <span className="text-destructive">−{file.deletionLength}</span>
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto text-muted-foreground"
              onClick={() => setUnfolded((current) => !current)}
            >
              {unfolded ? <FoldVerticalIcon /> : <UnfoldVerticalIcon />}
              {unfolded ? "Only what differs" : "All lines"}
            </Button>
          </>
        )}
      </div>
      <div ref={scroller} onScroll={onScroll} data-testid="diff-scroller" className="min-h-0 flex-1 overflow-y-auto">
        {same ? (
          <SameText text={newText} />
        ) : (
          <DiffView
            diffFile={file}
            diffViewMode={mode === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified}
            diffViewTheme={dark ? "dark" : "light"}
            diffViewWrap
            diffViewHighlight={false}
            diffViewFontSize={13}
          />
        )}
      </div>
    </div>
  );
}
