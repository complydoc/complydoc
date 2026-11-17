import { cn } from "@/lib/utils";

/**
 * The dot grid and glow behind a page's first section; decoration only.
 * `duo` adds a pink glow beside the baby blue one.
 */
export function Backdrop({ tone = "blue" }: { tone?: "blue" | "duo" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem]",
        tone === "duo" ? "backdrop-duo" : "backdrop-dots",
      )}
    />
  );
}
