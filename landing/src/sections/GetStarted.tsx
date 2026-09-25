import { ArrowRightIcon, TerminalIcon } from "lucide-react";
import { MARK_SMALL } from "@/ascii";
import { AsciiMark } from "@/components/AsciiMark";
import { CodeBlock } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { links } from "@/links";

/** From nothing to the viewer on your own folder: install, audit, open. */
const STEPS = `uv tool install complydoc
complydoc audit ./documents
complydoc ui`;

export function GetStarted() {
  return (
    <section id="start" aria-labelledby="start-title" className="border-t">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-20 text-center md:py-28">
        <AsciiMark art={MARK_SMALL} className="text-[9px]" />
        <h2 id="start-title" className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          Run it on your own folder
        </h2>
        <p className="text-lg text-muted-foreground">
          complydoc runs locally. Network access is blocked while documents are read, and each report records that. MIT
          licensed.
        </p>
        <CodeBlock
          title="Install, audit, open the viewer"
          icon={<TerminalIcon className="size-3.5" />}
          lang="bash"
          code={STEPS}
          className="w-full text-left"
        />
        <p className="text-sm text-muted-foreground">
          <code className="font-mono">complydoc ui</code> opens every report in the folder in your browser, served from
          your machine, the way <code className="font-mono">mlflow ui</code> does for runs.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
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
    </section>
  );
}
