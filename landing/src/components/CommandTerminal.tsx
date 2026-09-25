import { AnimatedSpan, Terminal, TypingAnimation } from "@/components/ui/terminal";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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
  /** The label in the title bar. */
  title?: string;
  className?: string;
}

/**
 * Magic UI's terminal with complydoc's commands: each command is typed, then
 * its output appears line by line, once, when it comes on screen. Readers who
 * ask for reduced motion get every line at once.
 */
export function CommandTerminal({ lines, title = "~/documents", className }: CommandTerminalProps) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const terminalClass = cn("max-w-none font-mono", className);

  const render = (line: TerminalLine, animate: boolean) => {
    if ("command" in line) {
      return animate ? (
        <TypingAnimation duration={22} className="font-mono text-[13px]">{`$ ${line.command}`}</TypingAnimation>
      ) : (
        <span className="font-mono text-[13px]">{`$ ${line.command}`}</span>
      );
    }
    const className = cn("font-mono text-[13px] whitespace-pre", line.tone && TONE[line.tone]);
    const text = line.output || " ";
    return animate ? <AnimatedSpan className={className}>{text}</AnimatedSpan> : <span className={className}>{text}</span>;
  };

  if (reduced) {
    return (
      <Terminal sequence={false} title={title} className={terminalClass}>
        {lines.map((line, i) => (
          <span key={i} className="grid">
            {render(line, false)}
          </span>
        ))}
      </Terminal>
    );
  }

  return (
    <Terminal title={title} className={terminalClass}>
      {lines.map((line) => render(line, true))}
    </Terminal>
  );
}
