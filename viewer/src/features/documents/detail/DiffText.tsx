import { cn } from "@/lib/utils";
import type { DiffPart } from "@/report/readings";

interface DiffTextProps {
  parts: DiffPart[];
  /** Which side this is: what the left lacks is lost, what the right adds is gained. */
  side: "left" | "right";
}

/**
 * A reading with the words the other reading lacks marked.
 *
 * No shadcn registry carries a text diff, so this is the one piece of markup
 * drawn here, on the theme's tokens.
 */
export function DiffText({ parts, side }: DiffTextProps) {
  return (
    <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
      {parts.map((part, index) =>
        part.changed ? (
          <mark
            key={index}
            className={cn(
              "rounded-xs px-0.5",
              side === "left" ? "bg-destructive-soft text-destructive" : "bg-success-soft text-success",
            )}
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </pre>
  );
}
