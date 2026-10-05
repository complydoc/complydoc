import { cn } from "@/lib/utils";

/**
 * Keys to press, each in a key cap, as Linear writes its shortcuts: G then T is two caps
 * side by side.
 */
export function Keys({
  keys,
  className,
  inverted = false,
}: {
  keys: string[];
  className?: string;
  /** Drawn on a tooltip's dark ground rather than on the page. */
  inverted?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border px-1 font-sans text-[11px] leading-none font-medium",
            inverted
              ? "border-background/20 bg-background/10 text-background/80"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
