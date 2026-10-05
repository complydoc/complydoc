import { ChevronDownIcon, ChevronUpIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Hint } from "@/components/Hint";
import { useSidebarEdge } from "@/hooks/useSidebarEdge";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const WIDTH_KEY = "complydoc.trace-panel-width";
const WIDE_KEY = "complydoc.trace-panel-wide";
/** Narrower than this, the calls and the call picked no longer fit side by side. */
const NARROWEST = 760;

function rememberedWidth(): number | null {
  try {
    const width = Number(window.localStorage.getItem(WIDTH_KEY));
    return width >= NARROWEST ? width : null;
  } catch {
    return null;
  }
}

function rememberedWide(): boolean {
  try {
    return window.localStorage.getItem(WIDE_KEY) === "1";
  } catch {
    return false;
  }
}

const button =
  "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

/**
 * A run's trace, open beside the table of runs: over most of the page, with the table still
 * showing at its left to pick another. Up and down go to the run above or below; Escape
 * closes it.
 */
export function TracePanel({
  position,
  onClose,
  onPrevious,
  onNext,
  children,
}: {
  /** Which run of how many, as the table lists them. */
  position: { at: number; of: number };
  onClose: () => void;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  children: ReactNode;
}) {
  // Kept across runs: opening another run remounts the page, and would narrow it again.
  const [wide, setWideState] = useState(rememberedWide);
  const setWide = (to: boolean) => {
    setWideState(to);
    try {
      window.localStorage.setItem(WIDE_KEY, to ? "1" : "0");
    } catch {
      // It opens beside the runs next time.
    }
  };
  // Dragged by its left edge, as wide as it was left; at first it leaves the runs' first
  // columns showing.
  const [width, setWidth] = useState<number | null>(rememberedWidth);
  // However wide, beside the runs it stops at the sidebar, so the pages stay in reach.
  const edge = useSidebarEdge();

  const drag = (event: ReactPointerEvent) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let last = width;
    const move = (e: PointerEvent) => {
      last = Math.min(window.innerWidth - Math.max(48, edge), Math.max(NARROWEST, window.innerWidth - e.clientX));
      setWidth(last);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move as EventListener);
      handle.removeEventListener("pointerup", up);
      try {
        if (last) window.localStorage.setItem(WIDTH_KEY, String(Math.round(last)));
      } catch {
        // It opens at its first width next time.
      }
    };
    handle.addEventListener("pointermove", move as EventListener);
    handle.addEventListener("pointerup", up);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      // A dialog or menu open over the panel has the keys first.
      if (document.querySelector("[role=dialog][data-state=open], [role=menu]")) return;
      if (event.key === "Escape") onClose();
      // Up and down move between runs, unless something focused, such as the call tree or a
      // field, has them.
      const target = event.target as HTMLElement | null;
      const focused = target && target !== document.body && target.closest("input, textarea, select, [role=tree]");
      if (focused) return;
      if (event.key === "ArrowUp" && onPrevious) {
        event.preventDefault();
        onPrevious();
      } else if (event.key === "ArrowDown" && onNext) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrevious, onNext]);

  // Drawn at the top of the document, not inside the page: widened, it covers the sidebar
  // and the app's bar, which nothing the page is wrapped in may be allowed to paint over.
  return createPortal(
    <aside
      aria-label="Trace"
      className={cn(
        "fixed inset-y-0 right-0 z-30 flex w-full animate-panel-in flex-col border-l bg-background shadow-2xl",
        // Beside the runs it sits under the app's bar; widened it takes the whole window, the
        // bar and its sidebar toggle with it, as they act on what it hides.
        !wide && "md:top-12",
        !wide && !width && "lg:w-[max(760px,calc(100vw-32rem))]",
        !wide && width && "lg:w-(--panel-width)",
      )}
      style={
        wide
          ? undefined
          : ({
              ...(width ? { "--panel-width": `${width}px` } : {}),
              ...(edge ? { maxWidth: `calc(100vw - ${edge}px)` } : {}),
            } as CSSProperties)
      }
    >
      {!wide && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the trace"
          onPointerDown={drag}
          onDoubleClick={() => {
            setWidth(null);
            try {
              window.localStorage.removeItem(WIDTH_KEY);
            } catch {
              // Nothing kept to forget.
            }
          }}
          className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize hover:bg-primary/20 lg:block"
        />
      )}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <Hint label="Close" keys={["Esc"]}>
          <button type="button" className={button} onClick={onClose} aria-label="Close">
            <XIcon className="size-4" />
          </button>
        </Hint>
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <Hint label="Newer run" keys={["↑"]}>
          <button
            type="button"
            className={button}
            onClick={onPrevious ?? undefined}
            disabled={!onPrevious}
            aria-label="Newer run"
          >
            <ChevronUpIcon className="size-4" />
          </button>
        </Hint>
        <Hint label="Older run" keys={["↓"]}>
          <button
            type="button"
            className={button}
            onClick={onNext ?? undefined}
            disabled={!onNext}
            aria-label="Older run"
          >
            <ChevronDownIcon className="size-4" />
          </button>
        </Hint>
        <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
          Run {position.at} of {position.of}
        </span>
        <Hint label={wide ? "Show the runs beside it" : "Take the whole window"}>
          <button
            type="button"
            className={cn(button, "ml-auto hidden lg:flex")}
            onClick={() => setWide(!wide)}
            aria-label={wide ? "Narrow" : "Widen"}
          >
            {wide ? <Minimize2Icon className="size-3.5" /> : <Maximize2Icon className="size-3.5" />}
          </button>
        </Hint>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:overflow-hidden">{children}</div>
    </aside>,
    document.body,
  );
}
