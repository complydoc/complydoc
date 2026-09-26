import { useRef, useState } from "react";
import { useInlineMarks, type InlineFindings, type MarkTick } from "@/hooks/useInlineMarks";
import { FindingRail } from "./FindingRail";

interface PageReadingProps {
  text: string;
  /** The page's first line: its number, and what it costs to read. */
  heading: string;
  /** Findings to mark where they sit in the text. */
  inline: InlineFindings;
}

/** One page's text, as read, with what was found on it marked the way the diff marks it. */
export function PageReading({ text, heading, inline }: PageReadingProps) {
  const container = useRef<HTMLDivElement>(null);
  const [ticks, setTicks] = useState<MarkTick[]>([]);
  useInlineMarks(container, inline.marks, {
    active: inline.active,
    focus: inline.focus,
    onPick: inline.onPick,
    onHover: inline.onHover,
    onLeave: inline.onLeave,
    onLaid: setTicks,
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={container}
        className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card px-5 py-4"
        data-testid="page-reading"
      >
        <p className="mb-3 font-mono text-xs text-muted-foreground">{heading}</p>
        {text.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing was read on this page.</p>
        )}
      </div>
      <FindingRail ticks={ticks} active={inline.active} onPick={inline.onRail} label={inline.label} />
    </div>
  );
}
