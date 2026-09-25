import { CodeBlock, Source } from "@/components/CodeBlock";
import { Section, TextLink } from "@/components/Section";
import { links } from "@/links";

const GUARD = `# armed before any file is opened
socket.socket.connect      -> raises
socket.socket.connect_ex   -> raises
socket.create_connection   -> raises
socket.getaddrinfo         -> raises
# AF_UNIX sockets still work`;

const PRINCIPLES = [
  {
    name: "Offline by construction",
    body: "Outbound sockets and DNS are blocked while documents are read, and each report records that the guard was armed. A loader that tries to phone home shows up as a network attempt.",
  },
  {
    name: "Two exits, both opt-in",
    body: "The typesafe classifier and complydoc assist are the only parts that send anything out. Both need allow_network=True, name the host before they run, and are recorded in the report.",
  },
  {
    name: "Unmeasured is not clean",
    body: "Without the name model, names are reported as not scanned, not as absent. A page with no text layer and no OCR is reported as unread. Every report lists its limitations.",
  },
  {
    name: "Masked everywhere",
    body: "Identifiers are masked in the HTML, the JSON and the page text, so a report can be shared. --reveal shows them, and the report says it did.",
  },
  {
    name: "A versioned report",
    body: "A self-contained HTML file and a JSON file with a published schema, readable back with load_report, diffable, and a DataFrame per section.",
  },
  {
    name: "Configured in YAML",
    body: "Prices, signal weights and detection patterns are data files. Name detection takes your own spaCy model per language, or any other model as a detector.",
  },
];

export function Offline() {
  return (
    <Section
      id="offline"
      label="how it works"
      title="Your documents stay on your machine"
      lead="complydoc exists to stop sensitive text leaving by accident, so it does not send any itself."
    >
      <div className="grid gap-10 *:min-w-0 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <CodeBlock title="network guard">
            <Source code={GUARD} />
          </CodeBlock>
          <p className="text-sm text-muted-foreground">
            <TextLink href={links.offline}>Network isolation</TextLink>, in detail.
          </p>
        </div>
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {PRINCIPLES.map((principle) => (
            <div key={principle.name} className="flex flex-col gap-2">
              <dt className="text-sm font-semibold">{principle.name}</dt>
              <dd className="text-sm text-muted-foreground">{principle.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
