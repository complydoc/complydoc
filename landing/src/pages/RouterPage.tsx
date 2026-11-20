import { RouteMap } from "@/components/RouteMap";
import { Section, TextLink } from "@/components/Section";
import { ROUTED_DOCUMENTS, ROUTING_COST_USD, ROUTING_MODEL } from "@/data/routing";
import { links } from "@/links";
import { Page, PageHeader } from "@/pages/Page";
import { RouterMeasured } from "@/sections/Measured";

const usd = (value: number) => `$${value.toFixed(3)}`;

/** How each page is decided, with a vision model available (the default). From docs/guides/routing.md. */
const RULES: { route: string; when: string }[] = [
  { route: "text", when: "A usable text layer, and nothing on the page that plain text loses" },
  {
    route: "vision",
    when: "No usable text layer, a layer that is not text, a table with merged or stacked header cells, or a page that is mostly picture",
  },
];

/** Without a vision model (`vision: false`): only what costs nothing. */
const FREE_RULES: { route: string; when: string }[] = [
  { route: "text", when: "A text layer, whatever its state" },
  { route: "ocr", when: "No usable text layer: the page is read by local OCR" },
];

/** The four prices a plan quotes, for the sample folder. */
const PRICES: { label: string; value: number }[] = [
  { label: "by the route each page needs", value: ROUTING_COST_USD.routed },
  { label: "every page from its text layer", value: ROUTING_COST_USD.text_layer },
  { label: "text layer, scans through local OCR", value: ROUTING_COST_USD.text_ocr },
  { label: "every page as an image to a vision model", value: ROUTING_COST_USD.vision },
];

const CONFIG = `routing:
  vision: true
  min_characters: 40
  min_text_coverage_pct: 30
  picture_share_pct: 50
  max_caption_chars: 500
  max_control_char_pct: 2
  min_wordlike_pct: 50
  vision_for_tables: complex`;

function RuleTable({ rows }: { rows: { route: string; when: string }[] }) {
  return (
    <dl className="flex flex-col border-t">
      {rows.map((row) => (
        <div key={row.route} className="grid gap-1 border-b py-4 sm:grid-cols-[6rem_1fr] sm:gap-6">
          <dt className="font-mono text-sm">{row.route}</dt>
          <dd className="text-pretty text-muted-foreground">{row.when}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RouterPage() {
  return (
    <Page>
      <PageHeader
        title="The router"
        lead="A folder is a mix of pages: some carry their text, some are scans, some are tables plain text scrambles. The router measures every page before anything is sent, picks the cheapest reader that loses nothing, and writes down why."
      />

      <section aria-label="A routed folder">
        <div className="mx-auto max-w-6xl px-6">
          <figure className="showcase-backdrop flex flex-col gap-6 rounded-2xl border p-4 sm:p-8 md:p-14">
            <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr] lg:gap-6">
              <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                <p className="font-mono text-xs text-muted-foreground">complydoc routing ./documents</p>
                <RouteMap documents={ROUTED_DOCUMENTS} />
              </div>
              <dl className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm sm:p-6 lg:mt-16">
                <p className="text-xs text-muted-foreground">Every page, priced for {ROUTING_MODEL}</p>
                {PRICES.map((price, i) => (
                  <div key={price.label} className="flex items-baseline justify-between gap-4 text-sm">
                    <dt className={i === 0 ? "font-medium" : "text-muted-foreground"}>{price.label}</dt>
                    <dd className="font-mono tabular-nums">{usd(price.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <figcaption className="text-center text-sm text-muted-foreground">
              The sample folder, routed. Hover a page to see why it went where it did.
            </figcaption>
          </figure>
        </div>
      </section>

      <Section
        id="rules"
        title="How each page is decided"
        lead="With a vision model available, which is the default, a page goes to vision only when plain text would lose it. Without one, routing uses only what costs nothing."
      >
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-4">
            <h3 className="text-xl font-medium">With a vision model</h3>
            <RuleTable rows={RULES} />
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="text-xl font-medium">Without one</h3>
            <RuleTable rows={FREE_RULES} />
            <p className="text-sm text-muted-foreground">
              Where OCR will read a page poorly, a coarse scan or one read with low confidence, the plan says a
              vision model would read it better.
            </p>
          </div>
        </div>
      </Section>

      <RouterMeasured />

      <Section
        id="config"
        title="Every threshold is a setting"
        lead={
          <>
            The rules live in <code className="font-mono text-base">readiness.yaml</code> under{" "}
            <code className="font-mono text-base">routing</code>. A plan is written to{" "}
            <code className="font-mono text-base">complydoc-routing.json</code>, a manifest an ingestion job can read.
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <pre className="overflow-x-auto rounded-xl border bg-card p-5 font-mono text-sm leading-6">{CONFIG}</pre>
          <p>
            <TextLink href={links.routing}>The routing guide</TextLink>
          </p>
        </div>
      </Section>
    </Page>
  );
}
