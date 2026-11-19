import { ArrowRightIcon } from "lucide-react";
import { IndustryCards } from "@/components/IndustryCards";
import { IndustryPhoto } from "@/components/IndustryPhoto";
import { VeilLine } from "@/components/VeilLine";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Industry } from "@/pages/industries";
import { Page } from "@/pages/Page";

/** Two levels below the landing page: industries/<slug>/. */
const HOME = "../../";

/** How Veil helps one industry: a headline, a photo, its documents, and a line as the model reads it. */
export function IndustryPage({ industry }: { industry: Industry }) {
  return (
    <Page home={HOME}>
      <section id="top" aria-labelledby="page-title">
        <div className="mx-auto flex max-w-6xl flex-col gap-16 px-6 pt-20 pb-24 md:pt-28">
          <div className="flex flex-col items-center gap-8 text-center">
            <h1 id="page-title" className="max-w-4xl text-5xl font-medium tracking-tight text-balance md:text-7xl">
              Veil for {industry.audience}
            </h1>
            <p className="max-w-2xl text-xl text-pretty text-muted-foreground">{industry.lead}</p>
          </div>
          <figure className="flex flex-col gap-3">
            <IndustryPhoto industry={industry} className="aspect-[16/9] md:aspect-[21/9]" />
            {industry.photo && (
              <figcaption className="text-xs text-muted-foreground">
                Photo by{" "}
                <a href={industry.photo.page} className="underline underline-offset-4 hover:text-foreground">
                  {industry.photo.by}
                </a>{" "}
                on Unsplash
              </figcaption>
            )}
          </figure>
        </div>
      </section>

      <section aria-label="What Veil does with these documents">
        <div className="mx-auto flex max-w-6xl flex-col gap-24 px-6 pb-24 md:pb-32">
          <div className="grid gap-12 md:grid-cols-3">
            <List title="The documents" items={industry.documents} />
            <List title="What Veil covers" items={industry.veiled} />
            <List title="What it keeps" items={industry.kept} />
          </div>

          <div className="flex flex-col gap-6">
            <Separator />
            <VeilLine pieces={industry.example} className="max-w-4xl md:text-xl md:leading-10" />
            <p className="text-sm text-muted-foreground">
              A made-up line, as the model reads it after {industry.model}.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="access-title" className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-24 text-center md:py-32">
          <h2 id="access-title" className="max-w-3xl text-4xl font-medium tracking-tight text-balance md:text-5xl">
            Try Veil on your own documents.
          </h2>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Veil is in training. We are looking for teams to test it on real documents, on their own machines.
          </p>
          <Button size="lg" asChild>
            <a href={`${HOME}enterprise/#contact`} data-page="">
              Ask for early access
              <ArrowRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </section>

      <section aria-labelledby="more-title" className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-24">
          <h2 id="more-title" className="text-3xl font-medium tracking-tight">
            Other industries
          </h2>
          <IndustryCards home={HOME} except={industry.slug} />
        </div>
      </section>
    </Page>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">{title}</h2>
      <ul className="flex flex-col gap-2 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
