import { useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

const NOISE = "01:;-=+*#%@/\\|<>{}[]";
const DURATION_MS = 1100;

/**
 * The mark drawn in characters, from src/ascii.ts.
 *
 * On first paint it is read in, left to right: each cell shows noise until the
 * sweep passes it, the way a page is read before it is known. It runs once,
 * and not at all for a reader who asks for reduced motion.
 */
export function AsciiMark({ art, className }: { art: string; className?: string }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [text, setText] = useState(art);

  useEffect(() => {
    if (reduced) return;
    const lines = art.split("\n");
    const width = Math.max(...lines.map((line) => line.length));
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      const front = progress * (width + 8);
      setText(
        lines
          .map((line) =>
            [...line]
              .map((char, x) => {
                if (char === " " || x < front - 8) return char;
                if (x > front) return " ";
                return NOISE[Math.floor(Math.random() * NOISE.length)];
              })
              .join(""),
          )
          .join("\n"),
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [art, reduced]);

  return (
    <pre aria-hidden="true" className={cn("ascii text-primary", className)}>
      {reduced ? art : text}
    </pre>
  );
}
