import { CodeBlock, Faint } from "@/components/CodeBlock";
import { Section, TextLink } from "@/components/Section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { links } from "@/links";

/** From `complydoc routing ./documents` on viewer/sample/documents, priced for Claude Sonnet 5 at medium resolution. */
const COSTS = [
  { how: "by the route each page needs", usd: "$0.0477", routed: true },
  { how: "all from the text layer", usd: "$0.0359", routed: false },
  { how: "text layer, scans through local OCR", usd: "$0.0359", routed: false },
  { how: "all as images to a vision model", usd: "$0.1056", routed: false },
];

export function Routing() {
  return (
    <Section
      id="routing"
      label="page routing"
      title="Send each page the cheapest way that still reads it"
      lead="The text layer costs the least and returns nothing for a scan. A vision model reads anything and costs the most. complydoc decides per page, gives the reason, and writes the plan as a manifest your ingestion job can read."
    >
      <div className="grid gap-8 *:min-w-0 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Every page, priced</TableHead>
                  <TableHead className="text-right">cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {COSTS.map((row) => (
                  <TableRow key={row.how}>
                    <TableCell className={row.routed ? "font-medium" : "text-muted-foreground"}>{row.how}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{row.usd}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-sm">
            {[
              ["text", "29 pages"],
              ["ocr", "0 pages"],
              ["vision", "4 pages"],
            ].map(([route, pages]) => (
              <div key={route} className="flex flex-col gap-1 bg-card p-4">
                <dt className="font-mono text-xs text-muted-foreground">{route}</dt>
                <dd className="font-medium">{pages}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            Routing the 33 sample pages costs less than half of sending them all as images. The text layer alone is
            cheaper still, and would lose three scans and a table with stacked headers.{" "}
            <TextLink href={links.routing}>How each page is decided</TextLink>.
          </p>
        </div>
        <CodeBlock title="complydoc-routing.json">
          <span className="block">{"{"}</span>
          <span className="block">{'  "model": "Claude Sonnet 5",'}</span>
          <span className="block">{'  "counts": { "pages": { "text": 29, "ocr": 0, "vision": 4 } },'}</span>
          <span className="block">{'  "documents": ['}</span>
          <span className="block">{'    { "document": "annual-report-2025.pdf", "pages": ['}</span>
          <span className="block">
            {'      { "page": 2, "route": "text",   "reason": '}
            <Faint>&quot;a text layer covering 17% of the page&quot;</Faint>
            {" },"}
          </span>
          <span className="block">
            {'      { "page": 3, "route": '}
            <span className="text-warning">&quot;vision&quot;</span>
            {', "reason": '}
            <Faint>&quot;a table with merged or stacked header cells, which plain text loses&quot;</Faint>
            {" },"}
          </span>
          <span className="block">{"      …"}</span>
          <span className="block">{'    { "document": "supplier-invoices-scanned.pdf", "pages": ['}</span>
          <span className="block">
            {'      { "page": 1, "route": '}
            <span className="text-warning">&quot;vision&quot;</span>
            {', "reason": '}
            <Faint>&quot;a scan at 150 dpi, below the 200 OCR needs&quot;</Faint>
            {" },"}
          </span>
          <span className="block">{"      …"}</span>
          <span className="block">{"}"}</span>
        </CodeBlock>
      </div>
    </Section>
  );
}
