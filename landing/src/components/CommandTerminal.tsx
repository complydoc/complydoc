import { SquareTerminalIcon } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** A command typed at the prompt, or a line it printed. */
export type TerminalLine = { command: string } | { output: string; tone?: "muted" | "good" | "warn" | "bad" };

const TONE = {
  muted: "text-muted-foreground",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
};

interface CommandTerminalProps {
  lines: TerminalLine[];
  className?: string;
}

/** Commands and what they printed, in the same frame as the code blocks. */
export function CommandTerminal({ lines, className }: CommandTerminalProps) {
  return (
    <figure className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <figcaption className="flex h-10 items-center gap-2 border-b bg-muted/40 px-3 text-xs text-muted-foreground">
        <SquareTerminalIcon className="size-4" />
        <span className="font-mono">Terminal</span>
      </figcaption>
      <ScrollArea className="w-full">
        <pre className="code p-4">
          {lines.map((line, i) =>
            "command" in line ? (
              <span key={i} className="block">
                <span className="text-muted-foreground select-none">$ </span>
                {line.command}
              </span>
            ) : (
              <span key={i} className={cn("block min-h-6", line.tone && TONE[line.tone])}>
                {line.output}
              </span>
            ),
          )}
        </pre>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </figure>
  );
}
