import { ArrowRightIcon } from "lucide-react";
import { MARK_SMALL } from "@/ascii";
import { AsciiMark } from "@/components/AsciiMark";
import { CodeBlock } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { links } from "@/links";

const START = `uv tool install complydoc
complydoc demo                # a report on the samples
complydoc audit ./documents   # then your own folder`;

export function GetStarted() {
  return (
    <section id="start" aria-labelledby="start-title" className="border-t">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 *:min-w-0 md:py-28 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <AsciiMark art={MARK_SMALL} className="text-[9px]" />
          <h2 id="start-title" className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Run it on a folder you already have.
          </h2>
          <p className="text-lg text-muted-foreground">
            It runs on your machine, and nothing leaves it unless you ask: the network is blocked while documents are
            read, and every report says so. MIT licensed.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" asChild>
              <a href={links.docs}>
                Read the docs
                <ArrowRightIcon data-icon="inline-end" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={links.github}>Star on GitHub</a>
            </Button>
          </div>
        </div>
        <CodeBlock title="shell" lang="bash" code={START} />
      </div>
    </section>
  );
}
