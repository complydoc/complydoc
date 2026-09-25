import { ArrowRightIcon } from "lucide-react";
import { MARK_SMALL } from "@/ascii";
import { AsciiMark } from "@/components/AsciiMark";
import { CopyButton } from "@/components/CopyButton";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { links } from "@/links";

const INSTALL = "uv tool install complydoc";

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
        <ButtonGroup>
          <ButtonGroupText className="font-mono text-sm">
            <span className="text-muted-foreground select-none">$</span>
            {INSTALL}
          </ButtonGroupText>
          <CopyButton text={INSTALL} label="Copy the install command" variant="outline" size="icon" />
        </ButtonGroup>
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
