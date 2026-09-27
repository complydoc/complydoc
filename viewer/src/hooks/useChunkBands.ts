/**
 * A splitter's chunks as bands over the text of each page, alternating so each boundary
 * shows, and flagged ones marked apart: a chunk cut mid-sentence or mid-table is the one
 * to see.
 *
 * Like the findings, they are CSS custom highlights over ranges of the text, so the
 * text's own elements are never touched. A page's text is looked for in the element
 * marked `data-page-body` with its number; its text nodes, taken in order, are the page's
 * text, which the chunks' offsets count in.
 */
import { useEffect, type RefObject } from "react";
import type { PageChunk } from "@/report/chunkPlaces";

const NAMES = ["complydoc-chunk-a", "complydoc-chunk-b", "complydoc-chunk-flagged"] as const;

const supported = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

interface Placed {
  node: Text;
  start: number;
}

/** The element's text nodes, each with the offset its text starts at. */
function textNodes(element: HTMLElement): Placed[] {
  const nodes: Placed[] = [];
  let length = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: length });
    length += (node as Text).length;
  }
  return nodes;
}

/** Where an offset into the element's text falls: a text node and the offset in it. */
function at(nodes: Placed[], offset: number): { node: Text; offset: number } | null {
  let found = nodes[0];
  for (const entry of nodes) {
    if (entry.start > offset) break;
    found = entry;
  }
  return found ? { node: found.node, offset: Math.min(offset - found.start, found.node.length) } : null;
}

export function useChunkBands(container: RefObject<HTMLElement | null>, pages: Map<number, PageChunk[]> | null) {
  useEffect(() => {
    const root = container.current;
    if (!supported() || !root || !pages || pages.size === 0) return;
    const bands = { a: new Highlight(), b: new Highlight(), flagged: new Highlight() };
    let order = 0;
    for (const [number, chunks] of [...pages].sort(([a], [b]) => a - b)) {
      const body = root.querySelector<HTMLElement>(`[data-page-body="${number}"]`);
      if (!body) continue;
      const nodes = textNodes(body);
      const last = nodes[nodes.length - 1];
      const length = last ? last.start + last.node.length : 0;
      for (const chunk of chunks) {
        if (chunk.start >= length) continue;
        const start = at(nodes, chunk.start);
        const end = at(nodes, Math.min(chunk.end, length));
        if (!start || !end) continue;
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        if (chunk.flags.length > 0) bands.flagged.add(range);
        else (order % 2 === 0 ? bands.a : bands.b).add(range);
        order += 1;
      }
    }
    CSS.highlights.set(NAMES[0], bands.a);
    CSS.highlights.set(NAMES[1], bands.b);
    CSS.highlights.set(NAMES[2], bands.flagged);
    return () => {
      for (const name of NAMES) CSS.highlights.delete(name);
    };
  }, [container, pages]);
}
