import { ArrowRightIcon } from "lucide-react";
import { GatewayFlow } from "@/art/GatewayFlow";
import { TextLink } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { links } from "@/links";
import { Page } from "@/pages/Page";

/** How the router reads each page. */
const ROUTES = [
  { name: "Text layer", detail: "Used when the page has a text layer that reads as text. It costs nothing." },
  { name: "Local OCR", detail: "Used for scans when no vision model is allowed. It runs on your machine." },
  { name: "Vision", detail: "Used for tables with merged headers, pictures, and pages that plain text would lose." },
];

/** What the gateway does with each request. */
const RULES = [
  { name: "A filter", detail: "It does not choose a model. Requests go to the model or tool your team already uses." },
  { name: "What passes", detail: "Only the text after Veil, with hidden instructions flagged. The original stays on your side." },
  { name: "A record", detail: "Each request is logged: who asked, which document, and what was covered." },
];

/** The router and the gateway: how each page is read, and what gets through to the model. */
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
              The router chooses how each page is read. Veil covers people's data. The gateway is a filter in front
              of the model you already use: only the clean text gets through.
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
            The router picks a reading method for each page and records why. It is in complydoc
            today: <TextLink href={links.routing}>page routing</TextLink>.
          </>
        }
        items={ROUTES}
      />
      <Part
        id="gateway"
        title="Gateway"
        lead="It sits between your documents and the model or tool your team already uses, and lets only clean text through. It is part of the team version, in early access."
        items={RULES}
      />
    </Page>
  );
}

function Part({
  id,
  title,
  lead,
  items,
}: {
  id: string;
  title: string;
  lead: React.ReactNode;
  items: { name: string; detail: string }[];
}) {
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
        <dl className="grid gap-10 md:grid-cols-3">
          {items.map((item) => (
            <div key={item.name} className="flex flex-col gap-2">
              <dt className="text-lg font-medium">{item.name}</dt>
              <dd className="text-pretty text-muted-foreground">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
