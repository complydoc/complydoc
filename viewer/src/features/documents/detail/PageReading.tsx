import { useRef } from "react";
import { useInlineMarks, type InlineMark } from "@/hooks/useInlineMarks";

interface PageReadingProps {
  text: string;
  /** The page's first line: its number, and what it costs to read. */
  heading: string;
  /** Findings to mark where they sit in the text. */
  marks: InlineMark[];
  active: string | null;
  focus: { key: string } | null;
  onPick: (key: string, rect: DOMRect) => void;
}

/** One page's text, as read, with what was found on it marked the way the diff marks it. */
export function PageReading({ text, heading, marks, active, focus, onPick }: PageReadingProps) {
  const container = useRef<HTMLDivElement>(null);
  useInlineMarks(container, marks, { active, focus, onPick });

  return (
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
  );
}
