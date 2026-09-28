import { useEffect, useRef, useState } from "react";
import { useChunkBands } from "@/hooks/useChunkBands";
import { useInlineMarks, type InlineFindings, type MarkTick } from "@/hooks/useInlineMarks";
import type { PageChunk } from "@/report/chunkPlaces";
import { formatCount, plural } from "@/report/format";
import { FindingRail } from "./FindingRail";

export interface TextPage {
  number: number;
  text: string;
  /** A few words beside the page's number, such as what it costs to read. */
  note?: string;
}

interface DocumentTextProps {
  pages: TextPage[];
  /** Findings to mark where they sit in the text. */
  inline: InlineFindings;
  /** A splitter's chunks by page, to draw as bands; null to draw none. */
  chunks: Map<number, PageChunk[]> | null;
  /** A page to scroll to; a new object each time, so asking twice scrolls twice. */
  jump: { page: number } | null;
  /** Called with the page at the top of the view as it scrolls. */
  onVisiblePage: (page: number) => void;
}

/** How far below the top of the view a page's header can be and still be the page being read. */
const READING_EDGE = 48;

/** What a splitter made of a page, beside the page's number. */
function chunkNote(chunks: PageChunk[] | undefined): string {
  if (!chunks || chunks.length === 0) return "no chunk placed";
  const flagged = chunks.filter((chunk) => chunk.flags.length > 0).length;
  return `${plural(chunks.length, "chunk")}${flagged ? `, ${formatCount(flagged)} flagged` : ""}`;
}

/**
 * The document's text as read, every page one after the other, each line numbered as
 * the findings count lines: the way the diff shows two readings, for a document read
 * one way. What was found is marked where it sits, and the rail at the edge shows where
 * in the whole document.
 *
 * A page's lines keep their line breaks as text, so the page's text nodes read, joined,
 * exactly as the page was read, and a chunk's offsets land where the splitter cut.
 */
export function DocumentText({ pages, inline, chunks, jump, onVisiblePage }: DocumentTextProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [ticks, setTicks] = useState<MarkTick[]>([]);
  useChunkBands(scroller, chunks);
  useInlineMarks(scroller, inline.marks, {
    active: inline.active,
    focus: inline.focus,
    onPick: inline.onPick,
    onHover: inline.onHover,
    onLeave: inline.onLeave,
    onLaid: setTicks,
  });

  useEffect(() => {
    const container = scroller.current;
    const header = jump ? container?.querySelector<HTMLElement>(`[data-page="${jump.page}"]`) : null;
    if (!container || !header) return;
    container.scrollTo({ top: header.offsetTop, behavior: "smooth" });
  }, [jump]);

  const onScroll = () => {
    // A short wait rather than an animation frame, which stops in a hidden tab.
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const container = scroller.current;
      if (!container) return;
      const edge = container.getBoundingClientRect().top + READING_EDGE;
      let current: number | null = null;
      for (const section of container.querySelectorAll<HTMLElement>("[data-page]")) {
        if (section.getBoundingClientRect().top > edge) break;
        current = Number(section.dataset.page);
      }
      if (current !== null) onVisiblePage(current);
    }, 60);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto" data-testid="page-reading">
        {pages.map((page) => (
          <section key={page.number} data-page={page.number} aria-label={`Page ${page.number}`}>
            <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-muted/85 px-4 py-1.5 font-mono text-xs text-muted-foreground backdrop-blur-sm">
              <span className="font-medium text-foreground">Page {page.number}</span>
              {page.note && <span>{page.note}</span>}
              {chunks && <span className="ml-auto">{chunkNote(chunks.get(page.number))}</span>}
            </header>
            {page.text.trim() ? (
              <div data-page-body={page.number} className="doc-lines py-3 font-mono text-[13px] leading-5">
                {page.text.split("\n").map((line, index, lines) => (
                  <div key={index} className="doc-line">
                    {line}
                    {index < lines.length - 1 ? "\n" : ""}
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">Nothing was read on this page.</p>
            )}
          </section>
        ))}
      </div>
      <FindingRail ticks={ticks} active={inline.active} onPick={inline.onRail} label={inline.label} />
    </div>
  );
}
