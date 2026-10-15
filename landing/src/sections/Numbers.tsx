import { Section, TextLink } from "@/components/Section";
import { ROUTING_COST_USD } from "@/data/routing";
import { links } from "@/links";

const ROUTED_SHARE = Math.round((ROUTING_COST_USD.routed / ROUTING_COST_USD.vision) * 100);

/** Each figure is one complydoc prints or its changelog records; none is an estimate. */
const FIGURES: { value: string; what: string; where: string; href: string; source: string }[] = [
  {
    value: "98%",
    what: "of the identifiers it reports are real",
    where: "On 4,200 pages of papers, annual reports, filings and books.",
    href: links.changelog,
    source: "Changelog, 0.7.3",
  },
  {
    value: "53 of 53",
    what: "labelled identifiers found",
    where: "In the corpus that ships with the package, at 91.4% precision. Run it yourself: complydoc benchmark.",
    href: links.accuracy,
    source: "Detection accuracy",
  },
  {
    value: `${ROUTED_SHARE}%`,
    what: "of the cost of sending every page as an image",
    where: "Routing the six sample documents page by page, with no page lost to a bad text layer.",
    href: links.routing,
    source: "Page routing",
  },
  {
    value: "0",
    what: "connections while your documents are read",
    where: "The network is blocked for the length of a run, and the report records that it was.",
    href: links.offline,
    source: "How offline is kept",
  },
];

export function Numbers() {
  return (
    <Section id="numbers" eyebrow="Measured" title="Numbers you can run again.">
      <dl className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {FIGURES.map((figure) => (
          <div key={figure.what} className="flex flex-col gap-2 border-t pt-6">
            <dt className="order-2 font-medium text-pretty">{figure.what}</dt>
            <dd className="order-1 text-4xl font-semibold tracking-tight tabular-nums md:text-5xl">{figure.value}</dd>
            <dd className="order-3 text-sm text-pretty text-muted-foreground">{figure.where}</dd>
            <dd className="order-4 text-sm">
              <TextLink href={figure.href}>{figure.source}</TextLink>
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
