import { Section, TextLink } from "@/components/Section";
import { Badge } from "@/components/ui/badge";
import { links } from "@/links";

interface Check {
  index: string;
  name: string;
  what: string;
  figure: string;
  unit: string;
  note: string;
  href: string;
}

/** Every figure is from `complydoc audit` on the six sample documents, as in the output above. */
const CHECKS: Check[] = [
  {
    index: "01",
    name: "Cost",
    what: "Text and vision tokens per document, priced across models and three extraction paths: the text layer, OCR and a vision model.",
    figure: "$0.0025",
    unit: "text path, 33 pages",
    note: "$0.0055 sent as images",
    href: links.routing,
  },
  {
    index: "02",
    name: "Readiness",
    what: "Measured signals: text layer coverage, tables, columns, rotation, scan resolution, garbled characters, glyph codes and repeated headers.",
    figure: "82.3",
    unit: "/100 extraction",
    note: "3 pages had no text to read",
    href: links.docs,
  },
  {
    index: "03",
    name: "Identifiers",
    what: "Personal and financial identifiers from Europe, the Americas, India and Australia, checked against their checksum where one exists, masked in every output.",
    figure: "42",
    unit: "in 4 of 6 documents",
    note: "••-34-56 · UK sort code · corroborated",
    href: links.identifiers,
  },
  {
    index: "04",
    name: "Hidden content",
    what: "Text a reader does not see and a model does: white or invisible text, hidden formatting, Unicode tag characters, and passages that read as instructions to a model.",
    figure: "1",
    unit: "passage",
    note: "white text on page 2, severity high",
    href: links.hiddenContent,
  },
];

export function Checks() {
  return (
    <Section
      id="checks"
      label="what it reports"
      title="Four checks, one report"
      lead="Each finding says how it was established: by checksum, corroboration, pattern or model. A signal that could not be measured is reported as unmeasured and left out of every score."
    >
      <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {CHECKS.map((check) => (
          <article key={check.name} className="flex flex-col gap-6 bg-card p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="text-base font-semibold">{check.name}</h3>
              <span className="font-mono text-xs text-faint">{check.index}</span>
            </div>
            <p className="text-sm text-muted-foreground">{check.what}</p>
            <div className="mt-auto flex flex-col gap-2">
              <p className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight">{check.figure}</span>
                <span className="text-xs text-muted-foreground">{check.unit}</span>
              </p>
              <p className="font-mono text-xs text-muted-foreground">{check.note}</p>
            </div>
            <a href={check.href} className="text-sm text-muted-foreground hover:text-foreground">
              How it is measured →
            </a>
          </article>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        <Badge variant="outline" className="mr-2 align-middle">sample</Badge>
        Figures from the six sample documents in the repository: 33 synthetic pages, every identifier invented or a
        published test value. Detection is{" "}
        <TextLink href={links.accuracy}>measured against a labelled corpus</TextLink>, with the misses published.
      </p>
    </Section>
  );
}
