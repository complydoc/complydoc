/**
 * A page's chunks as bands over its text, alternating so each boundary shows, and
 * flagged ones marked apart: a chunk cut mid-sentence or mid-table is the one to see.
 *
 * Like the findings, they are CSS custom highlights over ranges of the text, so the
 * text's own elements are never touched.
 */
import { useEffect, type RefObject } from "react";
import type { PageChunk } from "@/report/chunkPlaces";

const NAMES = ["complydoc-chunk-a", "complydoc-chunk-b", "complydoc-chunk-flagged"] as const;

const supported = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

/** The single text node of `element`'s text, with where each offset falls in it. */
function textNode(element: HTMLElement): Text | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  return node instanceof Text ? node : null;
}

export function useChunkBands(text: RefObject<HTMLElement | null>, chunks: PageChunk[] | null) {
  useEffect(() => {
    const element = text.current;
    if (!supported() || !element || !chunks || chunks.length === 0) return;
    const node = textNode(element);
    if (!node) return;
    const length = node.length;
    const bands = { a: new Highlight(), b: new Highlight(), flagged: new Highlight() };
    chunks.forEach((chunk, order) => {
      if (chunk.start >= length) return;
      const range = document.createRange();
      range.setStart(node, chunk.start);
      range.setEnd(node, Math.min(chunk.end, length));
      if (chunk.flags.length > 0) bands.flagged.add(range);
      else (order % 2 === 0 ? bands.a : bands.b).add(range);
    });
    CSS.highlights.set(NAMES[0], bands.a);
    CSS.highlights.set(NAMES[1], bands.b);
    CSS.highlights.set(NAMES[2], bands.flagged);
    return () => {
      for (const name of NAMES) CSS.highlights.delete(name);
    };
  }, [text, chunks]);
}
