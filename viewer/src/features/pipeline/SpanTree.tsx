import { ChevronRightIcon, CircleDollarSignIcon, ClockIcon, CoinsIcon, ShieldAlertIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fileName, formatCount, formatSeconds, formatUsd } from "@/report/format";
import { visibleSpans, type Span } from "@/report/traceTree";
import { KIND, durationTone } from "./kinds";
import { Pill } from "./pills";

/** Top-level calls beyond which the tree opens folded. */
const FOLD_ABOVE = 12;

interface SpanTreeProps {
  roots: Span[];
  selected: number;
  onSelect: (index: number) => void;
  /** The run's length, which each call's time is judged against. */
  total: number;
}

function Row({
  span,
  selected,
  folded,
  total,
  onSelect,
  onFold,
}: {
  span: Span;
  selected: boolean;
  folded: boolean;
  total: number;
  onSelect: () => void;
  onFold: () => void;
}) {
  const { stage } = span;
  const kind = KIND[stage.kind];
  const tokens = stage.kind === "embed" ? stage.tokens_in : (stage.tokens_out ?? stage.tokens_in);
  const high = stage.identifiers.some((i) => i.severity === "high");
  // A call inside another that read one file is known by that file; any other by its component.
  const byFile = span.depth > 0 && Boolean(span.label);
  const name = byFile ? fileName(span.label) || span.label : stage.component;
  const labelName = span.label ? fileName(span.label) || span.label : "";
  // Beside the name: the component for a file, or what the call read; for a document named by
  // its file already, the folder it sits in.
  const aside = byFile
    ? stage.component
    : labelName === name
      ? span.label.slice(0, -name.length).replace(/[\\/]$/, "")
      : labelName;
  return (
    <div
      role="treeitem"
      aria-level={span.depth + 1}
      aria-selected={selected}
      aria-expanded={span.children.length > 0 ? !folded : undefined}
      data-span={stage.index}
      onClick={onSelect}
      className={cn(
        "relative flex cursor-default flex-col gap-1.5 rounded-lg px-2 py-2 select-none hover:bg-muted/50",
        selected && "bg-muted hover:bg-muted",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {span.children.length > 0 ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={folded ? "Unfold" : "Fold"}
            onClick={(event) => {
              event.stopPropagation();
              onFold();
            }}
            className="-ml-1 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/15"
          >
            <ChevronRightIcon className={cn("size-3.5 transition-transform", !folded && "rotate-90")} />
          </button>
        ) : null}
        <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium ring-1", kind.pill)}>{kind.label}</span>
        <span className="min-w-0 truncate" title={span.label ? `${stage.component} · ${span.label}` : stage.component}>
          <span className="font-medium">{name}</span>
          {aside && <span className="ml-1.5 text-muted-foreground">{aside}</span>}
        </span>
      </div>
      <div className={cn("flex flex-wrap gap-1.5", span.children.length > 0 && "pl-5")}>
        <Pill
          icon={<ClockIcon />}
          className={
            stage.error ? "bg-destructive/10 text-destructive ring-destructive/30" : durationTone(stage.seconds, total)
          }
        >
          {formatSeconds(stage.seconds)}
        </Pill>
        {typeof tokens === "number" && <Pill icon={<CoinsIcon />}>{formatCount(tokens)}</Pill>}
        {typeof stage.usd === "number" && stage.usd > 0 && (
          <Pill icon={<CircleDollarSignIcon />}>{formatUsd(stage.usd)}</Pill>
        )}
        {stage.identifiers.length > 0 && (
          <Pill
            icon={<ShieldAlertIcon />}
            className={high ? "text-destructive ring-destructive/30" : "text-warning ring-warning/30"}
          >
            {formatCount(stage.identifiers.length)}
          </Pill>
        )}
      </div>
    </div>
  );
}

/**
 * Every call the run made, the calls made inside each beneath it on a guide line, each with
 * its kind, its time judged against the run, its tokens, and what was found in it. Up and
 * down, or J and K, move through the calls; left and right fold and unfold one.
 */
export function SpanTree({ roots, selected, onSelect, total }: SpanTreeProps) {
  // A long run opens folded, one line a call, so the calls can be seen at once.
  const [folded, setFolded] = useState<Set<number>>(
    () =>
      new Set(roots.length > FOLD_ABOVE ? roots.filter((r) => r.children.length > 0).map((r) => r.stage.index) : []),
  );
  const rows = visibleSpans(roots, folded);
  const tree = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tree.current?.querySelector(`[data-span="${selected}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const fold = (index: number, to?: boolean) =>
    setFolded((current) => {
      const next = new Set(current);
      if (to ?? !next.has(index)) next.add(index);
      else next.delete(index);
      return next;
    });

  const onKeyDown = (event: KeyboardEvent) => {
    const at = rows.findIndex((row) => row.stage.index === selected);
    const row = rows[at];
    if (event.key === "ArrowDown" || event.key === "j")
      onSelect(rows[Math.min(at + 1, rows.length - 1)]?.stage.index ?? selected);
    else if (event.key === "ArrowUp" || event.key === "k") onSelect(rows[Math.max(at - 1, 0)]?.stage.index ?? selected);
    else if (event.key === "ArrowLeft" && row) {
      if (row.children.length > 0 && !folded.has(row.stage.index)) fold(row.stage.index, true);
      else if (row.stage.parent !== null && row.stage.parent !== undefined) onSelect(row.stage.parent);
    } else if (event.key === "ArrowRight" && row && row.children.length > 0) fold(row.stage.index, false);
    else return;
    event.preventDefault();
  };

  const render = (span: Span): ReactNode => (
    <div key={span.stage.index}>
      <Row
        span={span}
        selected={span.stage.index === selected}
        folded={folded.has(span.stage.index)}
        total={total}
        onSelect={() => onSelect(span.stage.index)}
        onFold={() => fold(span.stage.index)}
      />
      {span.children.length > 0 && !folded.has(span.stage.index) && (
        <div role="group" className="ml-3 border-l pl-3">
          {span.children.map(render)}
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={tree}
      role="tree"
      aria-label="Calls"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-y-auto p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {roots.map(render)}
    </div>
  );
}
