import { CodeTabs } from "@/components/CodeTabs";
import { RouteLegend, RouteMap } from "@/components/RouteMap";
import { Section, TextLink } from "@/components/Section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ROUTED_DOCUMENTS, ROUTING_COST_USD, ROUTING_MODEL } from "@/data/routing";
import { links } from "@/links";

const PLANS = [
  { label: "Routed by page", usd: ROUTING_COST_USD.routed, strong: true },
  { label: "Text layer only", usd: ROUTING_COST_USD.text_layer, note: "loses 4 pages" },
  { label: "Images only", usd: ROUTING_COST_USD.vision },
];

const MAX = Math.max(...PLANS.map((plan) => plan.usd));

const USE_THE_PLAN = [
  {
    value: "cli",
    label: "Command line",
    lang: "bash" as const,
    code: `complydoc routing ./documents
# writes .complydoc/complydoc-routing.json, a manifest your ingestion job reads`,
  },
  {
    value: "python",
    label: "Ingestion job",
    lang: "python" as const,
    code: `import json

plan = json.load(open(".complydoc/complydoc-routing.json"))
for doc in plan["documents"]:
    for page in doc["pages"]:
        if page["route"] == "vision":
            send_to_vision_model(doc["document"], page["page"])
        else:
            use_text_layer(doc["document"], page["page"])`,
  },
  {
    value: "verify",
    label: "Check with your own model",
    lang: "bash" as const,
    code: `# read the pages the router flagged again, with a vision model of yours
complydoc audit ./documents --verify vision:mymodels:claude`,
    note: (
      <>
        complydoc does not run models or store keys. <code className="font-mono text-xs">mymodels.claude</code> is
        your function; page images go wherever it sends them, and the report records the host.
      </>
    ),
  },
];

export function PageRouter() {
  return (
    <Section
      id="router"
      eyebrow="Page router"
      title="Routing by page"
      lead="Sending every page to a vision model handles any layout and costs the most. The router gives each page one of three routes: the text layer when it is usable, local OCR for a readable scan, or a vision model when plain text would lose content. Each route comes with its reason."
    >
      <div className="grid gap-6 *:min-w-0 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>33 pages, 6 documents</CardTitle>
            <CardDescription>Hover a page to see why it got its route.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <RouteMap documents={ROUTED_DOCUMENTS} />
            <RouteLegend />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cost by plan</CardTitle>
            <CardDescription>The whole folder on {ROUTING_MODEL}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {PLANS.map((plan) => (
              <div key={plan.label} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className={plan.strong ? "font-medium" : "text-muted-foreground"}>
                    {plan.label}
                    {plan.note && <span className="text-faint"> · {plan.note}</span>}
                  </span>
                  <span className="font-mono">${plan.usd.toFixed(4)}</span>
                </div>
                <Progress value={(plan.usd / MAX) * 100} aria-label={`${plan.label}, $${plan.usd.toFixed(4)}`} />
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              The viewer&apos;s &ldquo;Routed page by page&rdquo; option prices every document this way, for every
              model.
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <CodeTabs tabs={USE_THE_PLAN} />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Routing thresholds (text coverage, scan resolution, OCR confidence, complex tables) are set in YAML.{" "}
        <TextLink href={links.routing}>How each page is decided</TextLink>.
      </p>
    </Section>
  );
}
