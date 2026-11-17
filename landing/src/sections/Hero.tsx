import { ArrowRightIcon, FileLock2Icon, KeyRoundIcon, ScaleIcon, type LucideIcon } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { ShowcaseVideo } from "@/components/ShowcaseVideo";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { links } from "@/links";

const INSTALL = "uv tool install complydoc";

const BADGES: { icon: LucideIcon; label: string }[] = [
  { icon: FileLock2Icon, label: "Runs on your machine" },
  { icon: KeyRoundIcon, label: "No account, no key" },
  { icon: ScaleIcon, label: "MIT licensed" },
];

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title">
      <div className="mx-auto flex max-w-6xl flex-col gap-16 px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <div className="flex flex-col gap-10">
            <h1 id="hero-title" className="text-5xl font-medium tracking-tight text-balance md:text-6xl">
              Get document loading right.
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <a href={links.docs}>
                  Get started
                  <ArrowRightIcon data-icon="inline-end" />
                </a>
              </Button>
              <ButtonGroup>
                <ButtonGroupText className="font-mono text-sm">
                  <span className="text-muted-foreground select-none">$</span>
                  {INSTALL}
                </ButtonGroupText>
                <CopyButton text={INSTALL} label="Copy the install command" variant="outline" size="icon" />
              </ButtonGroup>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-10">
            <p className="text-xl text-pretty md:pt-2">
              Compare loaders, trace every step and evaluate what reaches your model. complydoc
              reads your documents the way your pipeline does, and shows you what it got wrong.
            </p>
            <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
              {BADGES.map((badge) => (
                <li key={badge.label} className="flex items-center gap-2">
                  <badge.icon className="size-4" />
                  {badge.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <ShowcaseVideo />
      </div>
    </section>
  );
}
