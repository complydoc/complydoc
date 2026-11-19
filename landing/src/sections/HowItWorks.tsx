import type { ReactNode } from "react";
import documentDark from "@/assets/screens/document-dark.webp";
import documentLight from "@/assets/screens/document-light.webp";
import securityDark from "@/assets/screens/security-dark.webp";
import securityLight from "@/assets/screens/security-light.webp";
import { RouteMap } from "@/components/RouteMap";
import { Screenshot } from "@/components/Screenshot";
import { Section, TextLink } from "@/components/Section";
import { ROUTED_DOCUMENTS, ROUTING_COST_USD, ROUTING_MODEL } from "@/data/routing";
import { links } from "@/links";

const usd = (value: number) => `$${value.toFixed(3)}`;

interface StageProps {
  step: string;
  title: string;
  children: ReactNode;
  more: ReactNode;
  evidence: ReactNode;
}

/** One stage of the core: what it does on the left, its real output on the right. */
function Stage({ step, title, children, more, evidence }: StageProps) {
  return (
    <div className="grid items-start gap-10 border-t py-14 first:border-t-0 first:pt-0 lg:grid-cols-[5fr_7fr] lg:gap-16">
      <div className="flex flex-col gap-4">
        <span className="font-mono text-sm text-muted-foreground">{step}</span>
        <h3 className="text-2xl font-medium tracking-tight text-balance">{title}</h3>
        <p className="text-pretty text-muted-foreground">{children}</p>
        <p>{more}</p>
      </div>
      {evidence}
    </div>
  );
}

/** How the core works, stage by stage: the router, the checks and the trace. */
export function HowItWorks() {
  return (
    <Section
      id="how"
      title="How the core works"
      lead="Three stages run on every document, on your machine. Each one writes what it decided and why into the report, so a run can be traced and repeated."
    >
      <div className="flex flex-col">
        <Stage
          step="01 · route"
          title="Each page goes the cheapest way that reads it"
          more={<TextLink href="router/">How the router works</TextLink>}
          evidence={
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-6">
              <RouteMap documents={ROUTED_DOCUMENTS} />
              <p className="border-t pt-4 font-mono text-xs text-muted-foreground">
                routed {usd(ROUTING_COST_USD.routed)} · every page to {ROUTING_MODEL} as an image{" "}
                {usd(ROUTING_COST_USD.vision)}
              </p>
            </div>
          }
        >
          The router measures every page before anything is sent. A page with a good text layer is read as text, a
          scan goes to local OCR, and only a page with charts or handwriting goes to a vision model. Hover a page to
          see why it went where it did.
        </Stage>
        <Stage
          step="02 · check"
          title="Personal data and hidden instructions, found before indexing"
          more={<TextLink href={links.hiddenContent}>How hidden text is found</TextLink>}
          evidence={
            <Screenshot
              src={{ dark: securityDark, light: securityLight }}
              ratio={1856 / 1769}
              alt="The viewer's findings for a folder: identifiers by kind and by document, by severity, and one hidden instruction"
            />
          }
        >
          Deterministic rules find identifiers such as tax numbers, accounts and emails, and verify their checksums.
          Text a person cannot see, like white or tiny type, is taken out, and instructions written to an AI are
          flagged. The network is blocked while this runs.
        </Stage>
        <Stage
          step="03 · trace"
          title="Every step written down, page by page"
          more={<TextLink href={links.reportSchema}>The report format</TextLink>}
          evidence={
            <Screenshot
              src={{ dark: documentDark, light: documentLight }}
              ratio={1856 / 1083}
              alt="The text a loader returned for a contract, line by line, with personal data masked and each finding marked"
            />
          }
        >
          The report keeps the text the loader returned for every page, with each finding, route and timing. Open it in the viewer, diff two runs, or fail a build in CI when ingestion gets worse.
        </Stage>
      </div>
    </Section>
  );
}
