import { cn } from "@/lib/utils";

/**
 * Keys to press, each in a key cap, as Linear writes its shortcuts: G then T is two caps
 * side by side.
 */
export function Keys({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border bg-muted px-1 font-sans text-[11px] leading-none font-medium text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
