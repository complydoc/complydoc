import { ArrowRightIcon } from "lucide-react";
import { MARK, MARK_SMALL } from "@/ascii";
import { AsciiMark } from "@/components/AsciiMark";
import { CopyButton } from "@/components/CopyButton";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { links } from "@/links";
import { ProductTour } from "./ProductTour";

const INSTALL = "uv tool install complydoc";

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="overflow-hidden">
      <div className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="grid items-center gap-12 *:min-w-0 lg:grid-cols-[1fr_auto]">
          <div className="flex max-w-2xl flex-col gap-6">
            <AsciiMark art={MARK_SMALL} className="text-[9px] lg:hidden" />
            <p className="font-mono text-xs text-muted-foreground">document audit for AI pipelines · open source</p>
            <h1 id="hero-title" className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
              Know what your document loader extracted.
            </h1>
            <p className="text-lg text-pretty text-muted-foreground">
              complydoc audits documents, and the output of LangChain, LlamaIndex, Docling or any other loader, before
              they are embedded or sent to a model. It reports on security, cost, processing time and extracted content,
              page by page.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonGroup>
                <ButtonGroupText className="font-mono text-sm">
                  <span className="text-muted-foreground select-none">$</span>
                  {INSTALL}
                </ButtonGroupText>
                <CopyButton text={INSTALL} label="Copy the install command" variant="outline" size="icon" />
              </ButtonGroup>
              <Button size="lg" asChild>
                <a href={links.docs}>
                  Get started
                  <ArrowRightIcon data-icon="inline-end" />
                </a>
              </Button>
            </div>
          </div>
          <AsciiMark art={MARK} className="hidden text-[10px] lg:block xl:text-[11px]" />
        </div>
        <ProductTour className="mt-16 md:mt-20" />
      </div>
    </section>
  );
}
