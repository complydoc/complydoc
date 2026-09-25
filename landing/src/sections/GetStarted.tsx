import { ArrowRightIcon } from "lucide-react";
import { MARK_SMALL } from "@/ascii";
import { AsciiMark } from "@/components/AsciiMark";
import { CommandTerminal } from "@/components/CommandTerminal";
import { Button } from "@/components/ui/button";
import { links } from "@/links";

/** What `complydoc audit` printed for viewer/sample/documents, abridged. */
const START = [
  { command: "uv tool install complydoc" },
  { command: "complydoc audit ./documents" },
  { output: "Documents        6 (33 pages)" },
  { output: "Text path        $0.0025" },
  { output: "Vision path      $0.0055" },
  { output: "Readiness        75.4/100 ready", tone: "good" as const },
  { output: "Sensitive items  42 in 4/6 docs", tone: "warn" as const },
  { output: "Hidden content   1 passage, 1 high", tone: "bad" as const },
  { output: "Unread pages     3 (no OCR engine installed)", tone: "warn" as const },
  { output: "" },
  { output: "Report  .complydoc/complydoc.html", tone: "muted" as const },
];

export function GetStarted() {
  return (
    <section id="start" aria-labelledby="start-title" className="border-t">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 *:min-w-0 md:py-28 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <AsciiMark art={MARK_SMALL} className="text-[9px]" />
          <h2 id="start-title" className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Run it on your own folder
          </h2>
          <p className="text-lg text-muted-foreground">
            complydoc runs locally. Network access is blocked while documents are read, and each report records that.
            MIT licensed.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" asChild>
              <a href={links.docs}>
                Read the docs
                <ArrowRightIcon data-icon="inline-end" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={links.github}>View on GitHub</a>
            </Button>
          </div>
        </div>
        <CommandTerminal lines={START} />
      </div>
    </section>
  );
}
