import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";

interface CodeBlockProps {
  /** The file name or command shown in the bar above the code. */
  title: string;
  /** What the copy button copies. Without it there is no copy button. */
  copy?: string;
  children: ReactNode;
  className?: string | undefined;
}

/**
 * Code or terminal output in a hairline frame, with its name above it.
 *
 * Code is monochrome, with comments and prompts faint: colour on this page
 * means a state, as in the report, never a token kind.
 */
export function CodeBlock({ title, copy, children, className }: CodeBlockProps) {
  return (
    <figure className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <figcaption className="flex h-9 items-center justify-between border-b px-3 font-mono text-xs text-muted-foreground">
        <span className="truncate">{title}</span>
        {copy !== undefined && <CopyButton text={copy} label={`Copy ${title}`} />}
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-card-foreground">{children}</pre>
    </figure>
  );
}

/** A comment line, or the faint part of one. */
export function Faint({ children }: { children: ReactNode }) {
  return <span className="text-faint">{children}</span>;
}

/**
 * Plain source with `#` comments and `$` prompts made faint.
 * Enough for the short snippets on this page; not a highlighter.
 */
export function Source({ code }: { code: string }) {
  return code.split("\n").map((line, i) => {
    const comment = line.search(/(^|\s)#/);
    const prompt = line.startsWith("$ ");
    return (
      <span key={i} className="block min-h-6">
        {prompt && <Faint>$ </Faint>}
        {comment >= 0 ? (
          <>
            {line.slice(prompt ? 2 : 0, comment)}
            <Faint>{line.slice(comment)}</Faint>
          </>
        ) : (
          line.slice(prompt ? 2 : 0)
        )}
      </span>
    );
  });
}
