import { ArrowRightIcon } from "lucide-react";
import { MARK, MARK_SMALL } from "@/ascii";
import { AsciiMark } from "@/components/AsciiMark";
import { CopyButton } from "@/components/CopyButton";
import { Button } from "@/components/ui/button";
import { links } from "@/links";
import { AuditOutput } from "./AuditOutput";

const INSTALL = "uv tool install complydoc";

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title">
      <div className="mx-auto max-w-6xl border-x px-6 pt-16 pb-20 md:px-10 md:pt-24">
        <div className="grid items-center gap-12 *:min-w-0 lg:grid-cols-[1fr_auto]">
          <div className="flex max-w-xl flex-col gap-6">
            <AsciiMark art={MARK_SMALL} className="text-[10px] lg:hidden" />
            <p className="font-mono text-xs text-muted-foreground">
              open source · MIT · python 3.11 to 3.13 · runs offline
            </p>
            <h1 id="hero-title" className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
              Check documents before they reach an LLM.
            </h1>
            <p className="text-lg text-muted-foreground">
              complydoc reads your documents, and what your loaders made of them, and reports what they will cost to
              process, how reliably their text comes off the page, which identifiers they carry, and whether anything
              hidden in them is written for a model.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-9 w-fit items-center gap-3 rounded-lg border bg-card pr-1 pl-3 font-mono text-sm">
                <span className="text-faint select-none">$</span>
                <span>{INSTALL}</span>
                <CopyButton text={INSTALL} label="Copy the install command" />
              </div>
              <div className="flex gap-1">
                <Button size="lg" asChild>
                  <a href={links.docs}>
                    Read the docs
                    <ArrowRightIcon data-icon="inline-end" />
                  </a>
                </Button>
                <Button size="lg" variant="ghost" asChild>
                  <a href={links.github}>View source</a>
                </Button>
              </div>
            </div>
          </div>
          <AsciiMark art={MARK} className="hidden text-[10px] lg:block xl:text-[12px]" />
        </div>
        <AuditOutput className="mt-16" />
      </div>
    </section>
  );
}
