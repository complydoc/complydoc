import type { ReactNode } from "react";
import { ArrowRightIcon } from "lucide-react";
import { GatewayFlow } from "@/art/GatewayFlow";
import { TextLink } from "@/components/Section";
import { VeilLine } from "@/components/VeilLine";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { links } from "@/links";
import type { Piece } from "@/pages/industries";
import { Page } from "@/pages/Page";

/** A made-up contract, page by page, as the router plans it. The reasons are the ones complydoc writes. */
const PAGES = [
  { page: "Page 1", what: "Typed clauses", route: "text layer", why: "A usable text layer, and nothing on the page that plain text loses." },
  { page: "Page 2", what: "Price table", route: "vision", why: "A table with merged header cells. As plain text, its columns run together." },
  { page: "Page 3", what: "Signed scan", route: "vision", why: "No text layer. With vision turned off, it goes to local OCR instead." },
];

/** The three checks the gateway runs on the same text, at the same time. */
const CHECKS = [
  { name: "Rules", what: "Patterns with checksums: tax numbers, IBANs, cards, health numbers. Fast, and exact when they match." },
  { name: "Veil", what: "Our model, for what a pattern can't describe: a name, an address, a person mentioned in a sentence." },
  { name: "Veil Judge", what: "Decides who a value belongs to. A person's name is covered. A company's name stays, so the text still makes sense." },
];

const BEFORE = "Contrato entre João Pereira, NIF 213 456 789, e Atlântico Logística, S.A., com sede em Lisboa.";
const AFTER: Piece[] = [
  "Contrato entre ",
  { text: "João Pereira", owner: "person", kind: "name" },
  ", NIF ",
  { text: "213 456 789", owner: "person", kind: "tax no." },
  ", e ",
  { text: "Atlântico Logística, S.A.", owner: "company", kind: "company" },
  ", com sede em Lisboa.",
];

/** The router and the gateway: how each page is read, and what of it reaches the model. */
export function GatewayPage() {
  return (
    <Page>
      <section id="top" aria-labelledby="page-title">
        <div className="mx-auto flex max-w-6xl flex-col gap-16 px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="flex flex-col items-center gap-8 text-center">
            <h1 id="page-title" className="max-w-4xl text-5xl font-medium tracking-tight text-balance md:text-7xl">
              Router and gateway
            </h1>
            <p className="max-w-2xl text-xl text-pretty text-muted-foreground">
              Two steps between your documents and the model you use. The router decides how each page is read. The
              gateway decides what the model gets to see.
            </p>
            <Button size="lg" asChild>
              <a href="../enterprise/#contact" data-page="">
                Ask for early access
                <ArrowRightIcon data-icon="inline-end" />
              </a>
            </Button>
          </div>
          <GatewayFlow />
        </div>
      </section>

      <Part
        id="router"
        title="Router"
        lead={
          <>
            One PDF holds different kinds of page. Some carry their text, some are scans, some are tables that plain
            text scrambles. The router looks at each page, picks the cheapest way to read it that loses nothing, and
            writes down why. It is in complydoc today: <TextLink href={links.routing}>page routing</TextLink>.
          </>
        }
      >
        <figure className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <p className="border-b px-6 py-3 font-mono text-sm text-muted-foreground">contract.pdf</p>
            <ul className="divide-y">
              {PAGES.map((p) => (
                <li key={p.page} className="grid gap-2 px-6 py-5 md:grid-cols-[1fr_1fr_2fr] md:items-baseline md:gap-8">
                  <span className="font-medium">
                    {p.page} <span className="text-muted-foreground">· {p.what}</span>
                  </span>
                  <span className="font-mono text-sm text-primary">{p.route}</span>
                  <span className="text-pretty text-muted-foreground">{p.why}</span>
                </li>
              ))}
            </ul>
          </div>
          <figcaption className="text-sm text-muted-foreground">
            Reading the text layer costs nothing. A vision model reads anything and costs the most, so only the pages
            that need it go there.
          </figcaption>
        </figure>
      </Part>

      <Part
        id="gateway"
        title="Gateway"
        lead="A filter in front of the model or tool you already use. It doesn't choose the model. It decides which parts of the text reach it, with three checks reading the same text at once. If they can't agree, the value is covered."
      >
        <div className="flex flex-col gap-16">
          <dl className="grid gap-10 md:grid-cols-3">
            {CHECKS.map((check) => (
              <div key={check.name} className="flex flex-col gap-2">
                <dt className="text-lg font-medium">{check.name}</dt>
                <dd className="text-pretty text-muted-foreground">{check.what}</dd>
              </div>
            ))}
          </dl>

          <figure className="flex flex-col gap-4">
            <div className="grid overflow-hidden rounded-2xl border bg-card md:grid-cols-2">
              <div className="flex flex-col gap-3 p-6">
                <span className="text-sm text-muted-foreground">In the document</span>
                <p className="font-mono text-sm leading-8 text-pretty md:text-base md:leading-9">{BEFORE}</p>
              </div>
              <div className="flex flex-col gap-3 border-t p-6 md:border-t-0 md:border-l">
                <span className="text-sm text-muted-foreground">What the model gets</span>
                <VeilLine pieces={AFTER} />
              </div>
            </div>
            <figcaption className="text-sm text-muted-foreground">
              The rules catch the tax number, Veil catches the name, and Veil Judge keeps the company. Each request is
              logged: who asked, which document, and what was covered.
            </figcaption>
          </figure>
        </div>
      </Part>
    </Page>
  );
}

function Part({ id, title, lead, children }: { id: string; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 pb-24 md:pb-32">
        <Separator />
        <div className="grid gap-6 md:grid-cols-2 md:gap-16">
          <h2 id={`${id}-title`} className="text-4xl font-medium tracking-tight md:text-5xl">
            {title}
          </h2>
          <p className="text-lg text-pretty text-muted-foreground md:pt-2">{lead}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
