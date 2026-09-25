import { CodeTabs } from "@/components/CodeTabs";
import { RouteLegend, RouteMap } from "@/components/RouteMap";
import { Section, TextLink } from "@/components/Section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ROUTED_DOCUMENTS, ROUTING_COST_USD, ROUTING_MODEL } from "@/data/routing";
import { links } from "@/links";

const PLANS = [
  { label: "Routed page by page", usd: ROUTING_COST_USD.routed, strong: true },
  { label: "Everything from the text layer", usd: ROUTING_COST_USD.text_layer, note: "loses 4 pages" },
  { label: "Everything as page images", usd: ROUTING_COST_USD.vision },
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
        complydoc runs no model and holds no key: <code className="font-mono text-xs">mymodels.claude</code> is your
        function. The page images go where it sends them, and the report names the host.
      </>
    ),
  },
];

export function PageRouter() {
  return (
    <Section
      id="router"
      eyebrow="The page router"
      title="Route every page, not every document."
      lead="Sending a folder to a vision model is the safe choice and the expensive one. The router decides page by page: the text layer when it is usable, local OCR for a scan it can read, a vision model only when plain text would lose the page. Every page carries its reason."
    >
      <div className="grid gap-6 *:min-w-0 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>33 pages, 6 documents</CardTitle>
            <CardDescription>Hover a page for the reason it was sent where it was.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <RouteMap documents={ROUTED_DOCUMENTS} />
            <RouteLegend />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What it costs</CardTitle>
            <CardDescription>The folder on {ROUTING_MODEL}, three ways.</CardDescription>
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
              In the viewer, &ldquo;Routed page by page&rdquo; prices every document this way, beside every model.
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <CodeTabs tabs={USE_THE_PLAN} />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        The thresholds (text coverage, scan resolution, OCR confidence, complex tables) are YAML you can change.{" "}
        <TextLink href={links.routing}>How each page is decided</TextLink>.
      </p>
    </Section>
  );
}
