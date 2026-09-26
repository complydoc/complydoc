/**
 * Findings marked where they sit in text the viewer does not draw itself, such
 * as the diff, which a library renders and redraws as it pleases.
 *
 * The marks are CSS custom highlights over text ranges: the text's elements are
 * never touched, so a redraw cannot lose or break them, and they are laid again
 * whenever the text changes. A click on a mark is found by where the caret would
 * fall, since a highlight is not an element and takes no events.
 */
import { useEffect, useRef, type RefObject } from "react";

export type MarkTone = "high" | "medium" | "low" | "ignored";

export interface InlineMark {
  key: string;
  /** The text to mark, spacing aside. */
  needle: string;
  tone: MarkTone;
}

/** The names the marks are styled by, in index.css. */
const TONES: MarkTone[] = ["high", "medium", "low", "ignored"];
const ACTIVE = "complydoc-active";
const highlightName = (tone: MarkTone) => `complydoc-${tone}`;

interface TextIndex {
  text: string;
  nodes: { node: Text; start: number }[];
}

function indexText(container: HTMLElement): TextIndex {
  const nodes: TextIndex["nodes"] = [];
  let text = "";
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: text.length });
    text += node.textContent ?? "";
  }
  return { text, nodes };
}

/**
 * Where `needle` sits in the indexed text, spacing aside, as ranges over its text
 * nodes. A line the diff splits into several nodes where words changed is
 * searched whole, and each match mapped back to the nodes it spans.
 */
export function rangesOf(index: TextIndex, needle: string): Range[] {
  const words = needle.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const at = (offset: number) => {
    let found = index.nodes[0];
    for (const entry of index.nodes) {
      if (entry.start > offset) break;
      found = entry;
    }
    return found ? { node: found.node, offset: offset - found.start } : null;
  };
  const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "g");
  const ranges: Range[] = [];
  for (const match of index.text.matchAll(pattern)) {
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

/** Where the caret would fall at a point: the text node and the offset in it. */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const position = document.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

const supported = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

interface Options {
  /** The mark to draw out from the rest. */
  active: string | null;
  /** A mark to scroll to; a new object each time, so asking twice scrolls twice. */
  focus: { key: string } | null;
  /** A mark was clicked: its key, and where it is on screen. */
  onPick?: (key: string, rect: DOMRect) => void;
  /** The focused mark is not in the text, as when the diff has folded it away. */
  onMissing?: () => void;
}

export function useInlineMarks(
  container: RefObject<HTMLElement | null>,
  marks: InlineMark[],
  { active, focus, onPick, onMissing }: Options,
) {
  const placed = useRef(new Map<string, Range[]>());
  const callbacks = useRef({ onPick, onMissing });
  useEffect(() => {
    callbacks.current = { onPick, onMissing };
  });

  // Lay every mark, and again whenever the text is redrawn.
  useEffect(() => {
    const element = container.current;
    if (!element || !supported()) return;
    let timer = 0;
    const lay = () => {
      const index = indexText(element);
      const byTone = new Map<MarkTone, Range[]>(TONES.map((tone) => [tone, []]));
      placed.current = new Map();
      for (const mark of marks) {
        const ranges = rangesOf(index, mark.needle);
        placed.current.set(mark.key, ranges);
        byTone.get(mark.tone)?.push(...ranges);
      }
      for (const tone of TONES) CSS.highlights.set(highlightName(tone), new Highlight(...(byTone.get(tone) ?? [])));
      CSS.highlights.set(ACTIVE, new Highlight(...(active ? (placed.current.get(active) ?? []) : [])));
    };
    lay();
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lay, 50);
    });
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const tone of TONES) CSS.highlights.delete(highlightName(tone));
      CSS.highlights.delete(ACTIVE);
    };
  }, [container, marks, active]);

  // Scroll the focused mark into the top third, once it has been drawn.
  useEffect(() => {
    const element = container.current;
    if (!focus || !element) return;
    let attempts = 0;
    let timer = 0;
    const go = () => {
      const range = placed.current.get(focus.key)?.[0];
      if (!range) {
        attempts += 1;
        if (attempts === 4) callbacks.current.onMissing?.();
        if (attempts < 25) timer = window.setTimeout(go, 80);
        return;
      }
      const top = range.getBoundingClientRect().top - element.getBoundingClientRect().top;
      element.scrollTo({ top: element.scrollTop + top - element.clientHeight / 3, behavior: "smooth" });
    };
    timer = window.setTimeout(go, 0);
    return () => window.clearTimeout(timer);
  }, [container, focus]);

  // A click on a mark opens it; the pointer says which text can be clicked.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const hit = (event: MouseEvent) => {
      const caret = caretAt(event.clientX, event.clientY);
      if (!caret) return null;
      for (const [key, ranges] of placed.current) {
        const range = ranges.find((r) => r.isPointInRange(caret.node, caret.offset));
        if (range) return { key, range };
      }
      return null;
    };
    const click = (event: MouseEvent) => {
      const found = hit(event);
      if (found) callbacks.current.onPick?.(found.key, found.range.getBoundingClientRect());
    };
    let frame = 0;
    const move = (event: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.cursor = hit(event) ? "pointer" : "";
      });
    };
    element.addEventListener("click", click);
    element.addEventListener("mousemove", move);
    return () => {
      element.removeEventListener("click", click);
      element.removeEventListener("mousemove", move);
      cancelAnimationFrame(frame);
    };
  }, [container]);
}
