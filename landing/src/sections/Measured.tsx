import { CopyButton } from "@/components/CopyButton";
import { Section, TextLink } from "@/components/Section";
import { links } from "@/links";

/** What the router's rules were tested on, and what each test decided. From docs/guides/routing.md. */
const ROUTER_FINDINGS: { test: string; found: string; decided: string }[] = [
  {
    test: "Pages with no text layer, two public parsing benchmarks",
    found: "Local OCR kept far less of the page than a vision model",
    decided: "A page with no text layer goes to vision",
  },
  {
    test: "Pages with a poor text layer, same benchmarks",
    found: "The poor text layer still kept more than OCR",
    decided: "The free plan reads the text layer",
  },
  {
    test: "Held-out enterprise documents",
    found: "Without tables to vision: 2.5 points less kept, 8 points fewer pages to vision",
    decided: "Complex tables go to vision by default",
  },
  {
    test: "150 questions on plainly laid out company filings",
    found: "42% of pages to vision, and no more questions answered than the text layer",
    decided: "vision_for_tables: none is offered for corpora like it",
  },
];

/** The detection benchmark's figures, from `complydoc benchmark` (docs/explanation/accuracy.md). */
const DETECTION: { value: string; label: string }[] = [
  { value: "53 of 53", label: "labelled identifiers found, across 39 categories" },
  { value: "0", label: "wrong flags, on passages full of invoice and order numbers" },
  { value: "51", label: "passages in the corpus, shipped with the package" },
];

const BENCHMARK = "complydoc benchmark --verbose";

/** The router's rules and what each was tested on. */
export function RouterMeasured() {
  return (
    <Section
      id="measured"
      title="How the router is measured"
      lead="Every rule was kept because it won on a benchmark, page by page, against the cheapest reader that loses nothing."
    >
      <div className="flex flex-col gap-6">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Tested on</th>
                <th className="px-5 py-3 font-medium">What it showed</th>
                <th className="px-5 py-3 font-medium">What the router does</th>
              </tr>
            </thead>
            <tbody>
              {ROUTER_FINDINGS.map((row) => (
                <tr key={row.test} className="border-b align-top last:border-b-0">
                  <td className="px-5 py-4">{row.test}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.found}</td>
                  <td className="px-5 py-4 font-mono text-xs leading-5">{row.decided}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground">
          Every page carries the reason for its route, so a plan can be argued with.{" "}
          <TextLink href={links.routing}>The routing guide</TextLink>
        </p>
      </div>
    </Section>
  );
}

/** The detection benchmark, rerunnable from the command line. */
export function DetectionMeasured({ home = "" }: { home?: string }) {
  return (
    <Section
      id="measured"
      title="Measured, and rerunnable"
      lead="Detection is scored on a labelled corpus that ships with the package. The router's rules each won on a public benchmark."
    >
      <div className="flex flex-col gap-8">
        <dl className="grid gap-10 sm:grid-cols-3">
          {DETECTION.map((item) => (
            <div key={item.label} className="flex flex-col gap-2 border-t pt-5">
              <dt className="text-4xl font-medium tracking-tight tabular-nums">{item.value}</dt>
              <dd className="text-pretty text-muted-foreground">{item.label}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-md border bg-card px-3 py-2 font-mono text-sm">
            <span className="text-muted-foreground select-none">$ </span>
            {BENCHMARK}
          </code>
          <CopyButton text={BENCHMARK} label="Copy the benchmark command" variant="ghost" size="icon" />
          <TextLink href={links.accuracy}>How it is scored</TextLink>
          <TextLink href={`${home}router/#measured`}>How the router is measured</TextLink>
        </div>
      </div>
    </Section>
  );
}
