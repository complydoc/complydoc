import { useEffect, useState } from "react";
import { ArrowRightIcon } from "lucide-react";
import { VeilOrb } from "@/art/VeilOrb";
import { VeilScan } from "@/art/VeilScan";
import { IndustryCards } from "@/components/IndustryCards";
import { Section, TextLink } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Page } from "@/pages/Page";
import { CARD, COUNTRIES, DECISIONS, FAMILY, IDENTIFIERS, type Level } from "@/pages/veil-data";

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
              <a href="#card">Read the model card</a>
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-6 pb-24 md:pb-32">
          <VeilScan />
        </div>
      </section>

      <Section
        id="judge"
        title="Veil Judge decides whose data it is."
        lead="A landlord's bank account on an invoice is company data. The tenant's is personal. Covering both leaves the model unable to read the invoice. Veil Judge reads the context and covers only the tenant's."
      >
        <ul className="flex flex-col border-t">
          {DECISIONS.map((item) => (
            <li key={item.value} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 border-b py-5 md:grid-cols-[2fr_2fr_auto]">
              <span
                className={cn(
                  "w-fit rounded-[3px] font-mono text-sm md:text-base",
                  item.person ? "bg-foreground px-1.5 text-background" : "underline decoration-primary decoration-2 underline-offset-[6px]",
                )}
              >
                {item.value}
              </span>
              <span className="order-3 col-span-2 text-sm text-muted-foreground md:order-none md:col-span-1 md:text-base">
                {item.why}
              </span>
              <span className="text-right text-sm font-medium">{item.person ? "Person, veiled" : "Company, kept"}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="family" title="The Veil family.">
        <div className="grid gap-4 md:grid-cols-3">
          {FAMILY.map((model) => (
            <article key={model.name} className="flex flex-col gap-8 rounded-2xl border bg-card p-6 md:p-8">
              <div className="flex flex-col gap-3">
                <h3 className="text-4xl font-medium tracking-tight">
                  {model.name === "Veil 1 PT" ? <CountryName /> : model.name}
                </h3>
                <p className="text-pretty text-muted-foreground">{model.line}</p>
              </div>
              <dl className="mt-auto flex flex-col gap-3 border-t pt-6 text-sm">
                <Meter label="Coverage" level={model.coverage} />
                <Meter label="Speed" level={model.speed} />
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Runs on</dt>
                  <dd className="text-right">{model.runs}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Languages</dt>
                  <dd className="text-right">{model.languages}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="flex flex-col gap-6 rounded-2xl border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-3">
              <h3 className="text-3xl font-medium tracking-tight">Veil 1 PT Legal</h3>
              <p className="text-pretty text-muted-foreground">
                A country model trained further on one kind of document. The first is legal: contracts, court filings and
                powers of attorney, with the parties, their roles and their lawyers.
              </p>
            </div>
          </article>
          <article className="flex flex-col gap-6 rounded-2xl border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-3">
              <h3 className="text-3xl font-medium tracking-tight">Veil Judge</h3>
              <p className="text-pretty text-muted-foreground">
                The decision model. It runs after any Veil model, or after complydoc's rules, and decides for each value
                whether it belongs to a person or to a company.
              </p>
            </div>
          </article>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Coverage and speed place each model against the others in the family. They are not benchmark results.
        </p>
      </Section>

      <Section
        id="industries"
        title="By industry."
        lead={
          <>
            Each industry has its own documents and its own personal data. Veil runs inside complydoc's{" "}
            <TextLink href="../gateway/">router and gateway</TextLink>.
          </>
        }
      >
        <IndustryCards home="../" />
      </Section>

      <Section id="card" title="Model card.">
        <dl className="flex flex-col border-t">
          {CARD.map((row) => (
            <div key={row.term} className="grid gap-2 border-b py-5 md:grid-cols-[1fr_3fr] md:gap-16">
              <dt className="font-medium">{row.term}</dt>
              <dd className="text-pretty text-muted-foreground">{row.detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <section id="access" aria-labelledby="access-title" className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-24 text-center md:py-32">
          <h2 id="access-title" className="max-w-3xl text-4xl font-medium tracking-tight text-balance md:text-6xl">
            Try Veil on your own documents.
          </h2>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Veil is in training. We are looking for teams to test it on real documents, on their own machines.
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
    <span className="flex flex-col gap-3">
      <span>
        Veil 1{" "}
        <span className="relative inline-block overflow-hidden align-bottom">
          <span key={code} className="veil-turn inline-block">
            {code}
          </span>
        </span>
      </span>
      <span key={`id-${code}`} className="veil-turn block font-mono text-sm font-normal tracking-normal text-muted-foreground">
        {IDENTIFIERS[code]}
      </span>
    </span>
  );
}

function Meter({ label, level }: { label: string; level: Level }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex gap-1" aria-label={`${level} of 3`}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("h-1.5 w-6 rounded-full", n <= level ? "bg-foreground" : "bg-muted")} />
        ))}
      </dd>
    </div>
  );
}
