import { useEffect, useState } from "react";
import { ArrowRightIcon } from "lucide-react";
import { VeilOrb } from "@/art/VeilOrb";
import { VeilScan } from "@/art/VeilScan";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Page } from "@/pages/Page";
import { Industries } from "@/sections/Industries";
import { COUNTRIES, MODELS } from "@/pages/veil-data";

const EARLY_ACCESS = "../enterprise/#contact";

export function VeilPage() {
  return (
    <Page>
      <section id="top" aria-labelledby="page-title" className="overflow-hidden">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 pt-32 pb-16 text-center md:pt-44">
          <div className="relative flex w-full justify-center">
          <VeilOrb className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[min(600px,110vw)] -translate-x-1/2 -translate-y-1/2" />
          <h1 id="page-title" aria-label="Veil" className="veil-word relative text-[clamp(6rem,24vw,17rem)] leading-[0.82] font-medium tracking-[-0.06em]">
            {"Veil".split("").map((letter, i) => (
              <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.06em] align-bottom">
                <span className="veil-letter inline-block" style={{ animationDelay: `${i * 90}ms` }}>
                  {letter}
                </span>
              </span>
            ))}
          </h1>
          </div>
          <p className="mt-20 max-w-2xl text-xl text-pretty md:mt-32 md:text-2xl">
            complydoc's own model for personal data. It finds names, tax numbers, accounts and addresses in a
            document, and covers the ones that belong to people before the text goes to a model.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <a href={EARLY_ACCESS} data-page="">
                Ask for early access
                <ArrowRightIcon data-icon="inline-end" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#family">See the models</a>
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-6 pb-24 md:pb-32">
          <VeilScan />
        </div>
      </section>

      <Section id="family" title="The models.">
        <ul className="flex flex-col border-t">
          {MODELS.map((model) => (
            <li key={model.name} className="grid gap-2 border-b py-8 md:grid-cols-[2fr_3fr] md:items-baseline md:gap-16">
              <h3 className="text-3xl font-medium tracking-tight md:text-4xl">
                {model.name === "Veil 1 PT" ? <CountryName /> : model.name}
              </h3>
              <p className="text-lg text-pretty text-muted-foreground">{model.line}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Industries home="../" />

      <section id="access" aria-labelledby="access-title" className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-24 text-center md:py-32">
          <h2 id="access-title" className="max-w-3xl text-4xl font-medium tracking-tight text-balance md:text-6xl">
            Try Veil on your own documents.
          </h2>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Veil is in training and runs on your own machines. We are looking for teams to test it on real documents.
          </p>
          <Button size="lg" asChild>
            <a href={EARLY_ACCESS} data-page="">
              Ask for early access
              <ArrowRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </section>
    </Page>
  );
}

/** "Veil 1 PT", with the country turning over: ES, DE, FR, IT. */
function CountryName() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setI((n) => (n + 1) % COUNTRIES.length), 1800);
    return () => clearInterval(timer);
  }, []);
  const code = COUNTRIES[i] ?? "PT";
  return (
    <span>
      Veil 1{" "}
      <span className="relative inline-block overflow-hidden align-bottom">
        <span key={code} className="veil-turn inline-block">
          {code}
        </span>
      </span>
    </span>
  );
}
