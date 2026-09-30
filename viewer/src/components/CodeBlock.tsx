import { CheckIcon, ChevronRightIcon, CopyIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCount } from "@/report/format";

/** Lines shown before the rest wait behind a button. */
const SHOWN = 60;

interface CodeBlockProps {
  title: string;
  lines: string[];
  /** `output` is tinted, so what a step made stands apart from what it was given. */
  tone?: "plain" | "output";
  /** Beside the copy button, such as a way to the next step. */
  actions?: ReactNode;
  /** Said under the lines, such as the format they are in. */
  footer?: string;
  /** Whether a chevron by the title folds the lines away. */
  collapsible?: boolean;
}

/** Lines of text with their numbers down the side, a title above, and a button to copy them. */
export function CodeBlock({ title, lines, tone = "plain", actions, footer, collapsible = false }: CodeBlockProps) {
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const shown = all ? lines : lines.slice(0, SHOWN);
  const copy = () => {
    void navigator.clipboard?.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <section
      aria-label={title}
      className={cn(
        "overflow-hidden rounded-xl border",
        tone === "output" ? "border-success/30 bg-success-soft" : "bg-muted/40",
      )}
    >
      <header className={cn("flex items-center gap-2 border-inherit px-4 py-2", open && "border-b")}>
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="-ml-1 flex items-center gap-1.5 rounded text-xs font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground"
          >
            <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
            <h3>{title}</h3>
          </button>
        ) : (
          <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</h3>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {actions}
          <Button variant="outline" size="xs" onClick={copy} aria-label={`Copy the ${title.toLowerCase()}`}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </span>
      </header>
      <ol hidden={!open} className="overflow-x-auto py-2 font-mono text-[13px] leading-6">
        {shown.map((line, index) => (
          <li key={index} className="flex">
            <span className="w-12 shrink-0 border-r border-inherit pr-3 text-right text-muted-foreground/60 tabular-nums select-none">
              {index + 1}
            </span>
            {/* Indentation as padding, so a wrapped line stays under the one it continues. */}
            <span
              className={cn(
                "min-w-0 break-words whitespace-pre-wrap",
                line.trimStart().startsWith("#") && "text-muted-foreground",
              )}
              style={{ paddingLeft: `calc(1rem + ${line.length - line.trimStart().length}ch)` }}
            >
              {line.trimStart() || " "}
            </span>
          </li>
        ))}
      </ol>
      {open && (lines.length > SHOWN || footer) && (
        <footer className="flex items-center gap-3 border-t border-inherit px-4 py-1.5 text-xs text-muted-foreground">
          {footer}
          {lines.length > SHOWN && (
            <button
              type="button"
              onClick={() => setAll((current) => !current)}
              className="ml-auto hover:text-foreground"
            >
              {all ? "Fewer lines" : `All ${formatCount(lines.length)} lines`}
            </button>
          )}
        </footer>
      )}
    </section>
  );
}
