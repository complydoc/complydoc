import { ArrowRightIcon } from "lucide-react";
import traceDark from "@/assets/screens/trace-dark.webp";
import traceLight from "@/assets/screens/trace-light.webp";
import { CopyButton } from "@/components/CopyButton";
import { Screenshot } from "@/components/Screenshot";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { links } from "@/links";

const INSTALL = "uv tool install complydoc";
const SKILL = "complydoc skill --install";

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="overflow-hidden">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 pt-16 pb-20 text-center md:pt-24 md:pb-28">
        <div className="flex max-w-3xl flex-col items-center gap-6">
          <p className="font-mono text-xs text-muted-foreground">open source · runs on your machine</p>
          <h1 id="hero-title" className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            Observability for the pipeline that feeds your model.
          </h1>
          <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
            Agents are traced from the model call onwards. complydoc traces what comes before: every step that loads,
            cleans, splits, embeds and stores your documents.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
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
          <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
            Working with a coding agent?
            <code className="rounded-md border bg-card px-2 py-0.5 font-mono text-xs text-foreground">{SKILL}</code>
            <CopyButton text={SKILL} label="Copy the skill command" variant="ghost" size="icon" />
          </p>
        </div>
        <Screenshot
          src={{ dark: traceDark, light: traceLight }}
          alt="The viewer's trace of an ingestion pipeline: every call on a time axis with its time, cost and identifiers, a warning on a scanned file that loaded no text, and the embedding call's input"
          className="w-full text-left"
        />
      </div>
    </section>
  );
}
