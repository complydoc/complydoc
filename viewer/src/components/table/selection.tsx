import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Hint } from "@/components/Hint";

/** What is picked, and what can be done with it all at once, floating over the page's foot. */
export function SelectionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Selected rows"
      className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 animate-in items-center gap-1 rounded-xl bg-popover p-1.5 pl-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 fade-in-0 slide-in-from-bottom-2"
    >
      <span className="mr-2 tabular-nums">{count} selected</span>
      {children}
      <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      <Hint label="Clear the selection" keys={["Esc"]}>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear the selection"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </Hint>
    </div>
  );
}
