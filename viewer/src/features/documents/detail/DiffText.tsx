import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { segments } from "@/report/highlight";
import type { DiffPart } from "@/report/readings";

interface DiffTextProps {
  parts: DiffPart[];
  /** Which side this is: what the left lacks is lost, what the right adds is gained. */
  side: "left" | "right";
  /** A finding to mark and scroll to, such as a masked value. */
  needle?: string | null;
}

/**
 * A reading with the words the other reading lacks marked, and a finding, if
 * one was asked for, marked and scrolled into view.
 *
 * No shadcn registry carries a text diff, so this is markup drawn here, on the theme's tokens.
 */
export function DiffText({ parts, side, needle = null }: DiffTextProps) {
  const first = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const mark = first.current;
    const viewport = mark?.closest<HTMLElement>("[data-slot=scroll-area-viewport]");
    if (mark && viewport) viewport.scrollTop = Math.max(0, mark.offsetTop - viewport.clientHeight / 3);
  }, [needle]);

  const pieces = segments(parts, needle);
  const firstMark = pieces.findIndex((segment) => segment.highlighted);
  return (
    <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
      {pieces.map((segment, index) => {
        const isFirst = index === firstMark;
        if (!segment.changed && !segment.highlighted) return <span key={index}>{segment.text}</span>;
        return (
          <mark
            key={index}
            ref={isFirst ? first : undefined}
            data-finding={segment.highlighted || undefined}
            className={cn(
              "rounded-xs px-0.5",
              segment.changed && (side === "left" ? "bg-destructive-soft text-destructive" : "bg-success-soft text-success"),
              segment.highlighted && "bg-primary/20 text-foreground ring-2 ring-primary",
            )}
          >
            {segment.text}
          </mark>
        );
      })}
    </pre>
  );
}
