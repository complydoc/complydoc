import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileName, formatSeconds, formatUsd, plural } from "@/report/format";
import type { Span } from "@/report/traceTree";
import { KIND } from "./kinds";

/** Indentation for each level of the tree, in pixels. */
export const INDENT = 16;

/** The grid every line of the waterfall shares: the step, its place in time, what it passed on. */
export const COLUMNS = "grid grid-cols-[minmax(12rem,48%)_minmax(0,1fr)_3.25rem]";

/** The name a call goes by, and what to show beside it, muted. */
function naming(span: Span): { name: string; aside: string } {
  const { stage } = span;
  // A call that read one file is known by that file, which is what a reader looks for down
  // the list, its loader after it; a call inside another by what it read; any other by its
  // component, with the folder it read after it.
  const file = /\.[A-Za-z0-9]{1,5}$/.test(fileName(span.label));
  // A step of several calls goes by the component it called, with how many times after it.
  if (stage.method === "calls") return { name: stage.component, aside: span.label };
  const inside = stage.parent !== null && stage.parent !== undefined;
  const inFolder = span.depth > 0 && stage.kind === "document";
  const byFile = Boolean(span.label) && (inside || inFolder || (file && stage.kind !== "document"));
  const name = byFile ? fileName(span.label) || span.label : stage.component;
  const labelName = span.label ? fileName(span.label) || span.label : "";
  const aside =
    stage.kind === "folder"
      ? plural(stage.documents_out ?? 0, "document")
      : byFile
        ? stage.component
        : labelName === name
          ? span.label.slice(0, -name.length).replace(/[\\/]$/, "")
          : labelName;
  return { name, aside };
}

/** Lines down the side, one for each level above, joining a call to the calls around it. */
export function Guides({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          aria-hidden
          className="absolute inset-y-0 w-px bg-border"
          style={{ left: 8 + level * INDENT + 7 }}
        />
      ))}
    </>
  );
}

/** Where the call ran, as a bar on the run's time axis, with its time beside it. */
function Bar({ span, total }: { span: Span; total: number }) {
  const { stage } = span;
  const start = Math.min(1, Math.max(0, (stage.started ?? 0) / total));
  const width = Math.min(1 - start, Math.max(0, stage.seconds / total));
  const end = start + width;
  const priced = typeof stage.usd === "number" && stage.usd > 0 && stage.usd_basis !== "local";
  const label = `${formatSeconds(stage.seconds)}${priced ? ` · ${formatUsd(stage.usd ?? 0)}` : ""}`;
  // The time sits after the bar, before it where the bar runs to the end of the run, or on
  // its end where the bar runs from start to end, such as the run's own.
  const after = end < 0.78;
  const on = !after && start < 0.22;
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 h-2.5 min-w-0.5 -translate-y-1/2 rounded-[3px]",
          stage.error ? "bg-destructive" : KIND[stage.kind].bar,
        )}
        style={{ left: `${start * 100}%`, width: `max(2px, ${width * 100}%)` }}
      />
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums",
          on && "rounded-sm bg-card px-1",
        )}
        style={
          after
            ? { left: `calc(${end * 100}% + 6px)` }
            : on
              ? { right: `calc(${(1 - end) * 100}% + 2px)` }
              : { right: `calc(${(1 - start) * 100}% + 6px)` }
        }
      >
        {label}
      </span>
    </>
  );
}

/** How many identifiers the call passed on: red where one is of high severity. */
function Found({ span }: { span: Span }) {
  const { identifiers, scanned } = span.stage;
  if (scanned === "off" || identifiers.length === 0) return null;
  const high = identifiers.some((i) => i.severity === "high");
  return (
    <span className={cn("font-mono text-xs tabular-nums", high ? "text-destructive" : "text-warning")}>
      {identifiers.length}
    </span>
  );
}

/** One call: its name down the tree, its bar on the time axis, and what it passed on. */
export function WaterfallRow({
  span,
  total,
  selected,
  folded,
  onSelect,
  onFold,
}: {
  span: Span;
  total: number;
  selected: boolean;
  folded: boolean;
  onSelect: () => void;
  onFold: () => void;
}) {
  const { stage } = span;
  const kind = KIND[stage.kind];
  const { name, aside } = naming(span);
  const parent = span.children.length > 0;
  return (
    <div
      role="treeitem"
      aria-level={span.depth + 1}
      aria-selected={selected}
      aria-expanded={parent ? !folded : undefined}
      data-span={stage.index}
      onClick={onSelect}
      title={[
        span.label ? `${stage.component} · ${span.label}` : stage.component,
        ...(stage.warnings ?? []).map((w) => `⚠ ${w.message}`),
      ].join("\n")}
      className={cn(
        COLUMNS,
        "relative h-8 cursor-default items-center text-sm select-none hover:bg-muted/50",
        selected && "bg-muted hover:bg-muted",
      )}
    >
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
      <div
        className="@container relative flex h-full min-w-0 items-center gap-1.5 pr-3"
        style={{ paddingLeft: 8 + span.depth * INDENT }}
      >
        <Guides depth={span.depth} />
        {parent ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={folded ? "Unfold" : "Fold"}
            onClick={(event) => {
              event.stopPropagation();
              onFold();
            }}
            className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/15"
          >
            <ChevronRightIcon className={cn("size-3.5 transition-transform", !folded && "rotate-90")} />
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <kind.icon className={cn("size-3.5 shrink-0", kind.tone)} aria-label={kind.label} />
        <span className={cn("min-w-0 truncate", span.depth === 0 && "font-medium")}>{name}</span>
        {(stage.warnings?.length ?? 0) > 0 && (
          <TriangleAlertIcon
            className="size-3.5 shrink-0 text-warning"
            aria-label={`${stage.warnings?.length} warnings`}
          />
        )}
        {aside && (
          // Only where the column has room for it, rather than cut to a stub; the row's tooltip
          // and the call's panel name it either way.
          <span className="hidden min-w-0 shrink-[100] truncate text-xs text-muted-foreground @[22rem]:inline">
            {aside}
          </span>
        )}
      </div>
      <div className="relative h-full min-w-0">
        <Bar span={span} total={total} />
      </div>
      <div className="pr-3 text-right">
        <Found span={span} />
      </div>
    </div>
  );
}
