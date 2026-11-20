import { LayerArt } from "@/art/LayerArt";
import { CopyButton } from "@/components/CopyButton";
import { Section, TextLink } from "@/components/Section";
import { links } from "@/links";
import { Page, PageHeader } from "@/pages/Page";

const INSTALL = "uvx complydoc mcp --folder ~/Documents/Contracts";

/** The four verdicts `check_document` gives, and when. From docs/guides/assistant-mcp.md. */
const VERDICTS: { verdict: string; when: string }[] = [
  { verdict: "Ready to send", when: "No identifiers and no hidden text" },
  { verdict: "Send with care", when: "Identifiers that are not sensitive, such as an email address or a phone number" },
  {
    verdict: "Do not send as it is",
    when: "A sensitive identifier, or any text hidden from a reader: a model reads it whether or not it is worded as an instruction",
  },
  {
    verdict: "Could not be read",
    when: "Empty, damaged, password protected, of a type complydoc does not read, or a scan with no text OCR could find",
  },
];

/** What the gateway offers an assistant. */
const TOOLS: { tool: string; ask: string }[] = [
  { tool: "check_document", ask: "Can I share the Nordwind contract?" },
  { tool: "check_folder", ask: "Can I share the Proposals folder? Every verdict, the ones not to share first" },
  { tool: "open_document", ask: "Open the Acme proposal and summarise it. The clean text, never the file" },
  { tool: "search_documents", ask: "Which contracts mention penalties? Searched in the masked, cleaned text" },
  { tool: "save_clean_copy", ask: "Save me a clean copy to send to the client" },
  { tool: "list_runs, show_run", ask: "Where does the contracts pipeline spend its time? For engineers, over .complydoc" },
];

function Rows({ rows }: { rows: { key: string; value: string }[] }) {
  return (
    <dl className="flex flex-col border-t">
      {rows.map((row) => (
        <div key={row.key} className="grid gap-1 border-b py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
          <dt className="font-mono text-sm">{row.key}</dt>
          <dd className="text-pretty text-muted-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GatewayPage() {
  return (
    <Page>
      <PageHeader
        title="The gateway"
        lead="complydoc mcp serves a folder to any assistant over the Model Context Protocol. Every document is read, checked and cleaned on the computer, and only the clean copy crosses over. The file itself never does."
      >
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border bg-card px-3 py-2 font-mono text-sm">
            <span className="text-muted-foreground select-none">$ </span>
            {INSTALL}
          </code>
          <CopyButton text={INSTALL} label="Copy the command" variant="ghost" size="icon" />
        </div>
      </PageHeader>

      <section aria-label="The gateway between a folder and the assistants">
        <div className="mx-auto max-w-6xl px-6">
          <LayerArt />
        </div>
      </section>

      <Section
        id="verdicts"
        title="A verdict before anything is shared"
        lead="check_document answers whether a file is fit to share, with what the answer rests on and none of the file's content. Scans are read with the same OCR the assistant would get, so the verdict and the text never disagree."
      >
        <Rows rows={VERDICTS.map((v) => ({ key: v.verdict, value: v.when }))} />
      </Section>

      <Section
        id="tools"
        title="What an assistant can ask it"
        lead="Tools for people who are not engineers, and two for engineers who want to ask about their own pipeline runs."
      >
        <div className="flex flex-col gap-6">
          <Rows rows={TOOLS.map((t) => ({ key: t.tool, value: t.ask }))} />
          <p>
            <TextLink href={links.assistant}>The gateway guide</TextLink>
          </p>
        </div>
      </Section>
    </Page>
  );
}
