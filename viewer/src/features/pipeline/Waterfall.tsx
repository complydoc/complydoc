import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { tickLabel, ticks } from "@/report/timeAxis";
import { visibleSpans, type Span } from "@/report/traceTree";
import { COLUMNS, Guides, INDENT, WaterfallRow } from "./WaterfallRow";

/** Spans beyond which the tree opens folded. */
const FOLD_ABOVE = 60;

/** Children drawn at first under one span, and how many more each asking adds. */
const PAGE = 100;

interface WaterfallProps {
  roots: Span[];
  selected: number;
  onSelect: (index: number) => void;
  /** The run's length: the time axis runs from its start to its end. */
  total: number;
}

/** A line of the waterfall: a call, or the calls under one not drawn yet. */
type Line = { span: Span } | { more: number; parent: Span; depth: number };

/** The marks along the time axis, as faint lines down the waterfall, or as their labels. */
function Axis({ total, labels }: { total: number; labels?: boolean }) {
  const marks = ticks(total);
  return (
    <>
      {marks.map((at, index) => {
        const left = (at / total) * 100;
        if (!labels)
          return <span key={at} className="absolute inset-y-0 w-px bg-border/60" style={{ left: `${left}%` }} />;
        const last = index === marks.length - 1 && left > 90;
        return (
          <span
            key={at}
            className={cn("absolute top-1/2 -translate-y-1/2 font-mono tabular-nums", last && "-translate-x-full")}
            style={{ left: `${left}%` }}
          >
            {tickLabel(at)}
          </span>
        );
      })}
    </>
  );
}

/**
 * Every call the run made as a waterfall: the calls made inside each beneath it, each drawn
 * where it ran on the run's time axis and as long as it took, with how many identifiers it
 * passed on. Up and down, or J and K, move through the calls; left and right fold and unfold.
 */
export function Waterfall({ roots, selected, onSelect, total }: WaterfallProps) {
  // A large run opens folded, a line a folder or call, so its shape can be seen at once.
  const parents = (() => {
    const all: Span[] = [];
    const walk = (span: Span) => {
      all.push(span);
      span.children.forEach(walk);
    };
    roots.forEach(walk);
    // The run stays open whatever is folded: folded, it would leave one line.
    const folding = all.filter((s) => s.children.length > 0 && s.stage.kind !== "run");
    return { count: all.length, indexes: folding.map((s) => s.stage.index) };
  })();
  const [folded, setFolded] = useState<Set<number>>(() =>
    parents.count <= FOLD_ABOVE ? new Set() : new Set(parents.indexes),
  );
  const allFolded = parents.indexes.length > 0 && parents.indexes.every((index) => folded.has(index));
  // How many of a span's children are drawn, by span: a folder of a thousand draws a page.
  const [drawn, setDrawn] = useState<Map<number, number>>(() => new Map());
  const rows = visibleSpans(roots, folded);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.querySelector(`[data-span="${selected}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const fold = (index: number, to?: boolean) =>
    setFolded((current) => {
      const next = new Set(current);
      if (to ?? !next.has(index)) next.add(index);
      else next.delete(index);
      return next;
    });

  const lines: Line[] = [];
  // Each span's parent in the tree drawn, which for a step the viewer grouped is not the call's own.
  const above = new Map<number, number>();
  const walk = (span: Span) => {
    lines.push({ span });
    span.children.forEach((child) => above.set(child.stage.index, span.stage.index));
    if (span.children.length === 0 || folded.has(span.stage.index)) return;
    const shown = drawn.get(span.stage.index) ?? PAGE;
    span.children.slice(0, shown).forEach(walk);
    if (span.children.length > shown)
      lines.push({ more: span.children.length - shown, parent: span, depth: span.depth + 1 });
  };
  roots.forEach(walk);

  const onKeyDown = (event: KeyboardEvent) => {
    const at = rows.findIndex((row) => row.stage.index === selected);
    const row = rows[at];
    if (event.key === "ArrowDown" || event.key === "j")
      onSelect(rows[Math.min(at + 1, rows.length - 1)]?.stage.index ?? selected);
    else if (event.key === "ArrowUp" || event.key === "k") onSelect(rows[Math.max(at - 1, 0)]?.stage.index ?? selected);
    else if (event.key === "ArrowLeft" && row) {
      if (row.children.length > 0 && !folded.has(row.stage.index)) fold(row.stage.index, true);
      else if (above.has(row.stage.index)) onSelect(above.get(row.stage.index) as number);
    } else if (event.key === "ArrowRight" && row && row.children.length > 0) fold(row.stage.index, false);
    else return;
    event.preventDefault();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn(COLUMNS, "h-9 shrink-0 items-center border-b text-xs text-muted-foreground")}>
        <span className="flex items-center gap-1.5 pl-3">
          Step
          {parents.indexes.length > 0 && (
            <button
              type="button"
              onClick={() => setFolded(allFolded ? new Set() : new Set(parents.indexes))}
              aria-label={allFolded ? "Expand all" : "Collapse all"}
              title={allFolded ? "Expand all" : "Collapse all"}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {allFolded ? <ChevronsUpDownIcon className="size-3.5" /> : <ChevronsDownUpIcon className="size-3.5" />}
            </button>
          )}
        </span>
        <div className="relative h-full" aria-label="Time since the run began">
          <Axis total={total} labels />
        </div>
        <span className="pr-3 text-right" title="Identifiers each call passed on">
          IDs
        </span>
      </div>
      <div
        ref={list}
        role="tree"
        aria-label="Calls"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <div className="relative py-1">
          <div aria-hidden className={cn(COLUMNS, "pointer-events-none absolute inset-0")}>
            <span />
            <div className="relative">
              <Axis total={total} />
            </div>
          </div>
          {lines.map((line) =>
            "span" in line ? (
              <WaterfallRow
                key={line.span.stage.index}
                span={line.span}
                total={total}
                selected={line.span.stage.index === selected}
                folded={folded.has(line.span.stage.index)}
                onSelect={() => onSelect(line.span.stage.index)}
                onFold={() => fold(line.span.stage.index)}
              />
            ) : (
              <div key={`more-${line.parent.stage.index}`} className="relative flex h-8 items-center">
                <span className="relative h-full" style={{ width: 8 + line.depth * INDENT + 20 }}>
                  <Guides depth={line.depth} />
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDrawn((current) =>
                      new Map(current).set(
                        line.parent.stage.index,
                        (current.get(line.parent.stage.index) ?? PAGE) + PAGE,
                      ),
                    )
                  }
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {line.more} more
                </button>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
