import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A small figure beside a call: its time, tokens, cost or what was found in it. */
export function Pill({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-xs tabular-nums ring-1 ring-border [&_svg]:size-3",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
