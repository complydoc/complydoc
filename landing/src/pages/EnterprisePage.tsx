import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  FileLockIcon,
  FileSearchIcon,
  FolderLockIcon,
  ListChecksIcon,
  ShieldCheckIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react";
import { CloudArt } from "@/art/CloudArt";
import { BrandLogo } from "@/components/BrandLogo";
import { Section, TextLink } from "@/components/Section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { CONTACT_EMAIL, links } from "@/links";
import type { Brand } from "@/lib/logos";
import { ContactForm } from "@/pages/ContactForm";
import { Page, PageHeader } from "@/pages/Page";

/** Agents that speak MCP, and so can read documents through complydoc. */
const AGENTS: { name: string; brand: Brand }[] = [
  { name: "Claude", brand: "claude" },
  { name: "Codex", brand: "codex" },
  { name: "Cursor", brand: "cursor" },
  { name: "GitHub Copilot", brand: "githubcopilot" },
  { name: "Gemini", brand: "gemini" },
  { name: "Any MCP client", brand: "mcp" },
];

/** What an agent can do through complydoc's MCP server, one idea each. */
const CAN: { icon: LucideIcon; title: string; detail: string }[] = [
  {
    icon: FileSearchIcon,
    title: "Find a document",
    detail: "By part of its name, in the folders a person has shared, and nowhere else.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Say if it is safe to share",
    detail: "Ready to send, send with care, or do not send as it is, with what the verdict rests on.",
  },
  {
    icon: FileLockIcon,
    title: "Read a clean copy",
    detail: "Bank accounts, tax numbers and names masked, hidden instructions taken out, and a note of what was removed.",
  },
];

/** What keeps it safe, whichever agent asks. */
const KEEPS: { icon: LucideIcon; title: string; detail: string }[] = [
  {
    icon: FolderLockIcon,
    title: "Only folders a person picks",
    detail: "Chosen in the computer's own folder dialog. The agent can ask for it, never choose what it lands on.",
  },
  {
    icon: WifiOffIcon,
    title: "The file stays put",
    detail: "Documents are read where they are, with the network blocked. Only the cleaned text reaches the agent.",
  },
  {
    icon: ListChecksIcon,
    title: "Every read on record",
    detail: "For a team: which agent read which document, and what was masked, ready for an audit.",
  },
];

/** The verdict as complydoc gives it, on the sample invoices. */
const VERDICT = `Do not send as it is: rechnungen-2026-de.pdf
Found:
- German tax identification number: 3 (sensitive)
- IBAN: 3 (sensitive)
- Email address: 3
- Person name: 6
open_document gives a copy with these masked, which is safe to use.`;

const TODAY = [
  "The MCP server, for any agent that speaks MCP",
  "A verdict anyone understands, before a document is shared",
  "Personal and financial details masked, and text hidden from a reader taken out",
  "Only the folders a person picks, and no network connection while documents are read",
];

const FOR_TEAMS = [
  "Rolled out by IT, with the folders and what counts as sensitive set once for everyone",
  "A record of what each agent read, and what was masked, for audit",
  "A server inside your network, for agents that only reach a remote one, such as Microsoft 365 Copilot and ChatGPT",
  "Your shared drives and SharePoint as the folders, with the documents left where they are",
];

const QUESTIONS = [
  {
    q: "Do our documents leave the computer?",
    a: "The file never does. complydoc reads it where it is, with outbound connections blocked, and only the cleaned text joins the conversation the person was already having with the agent.",
    href: links.offline,
  },
  {
    q: "Can the agent open any file it likes?",
    a: "No. It reads only from folders a person picked, in their computer's own folder dialog, or that IT set for the team.",
    href: links.assistant,
  },
  {
    q: "What if someone attaches the file anyway?",
    a: "Then it reaches the agent whole: complydoc is the safe way in, not a lock. Where that must not happen, turn file uploads off in the agent's admin settings and leave complydoc as the way documents come in.",
    href: links.assistant,
  },
  {
    q: "What is the licence?",
    a: "MIT, for the MCP server and the engine under it. You can read every line that touches your documents.",
    href: links.github,
  },
];

export function EnterprisePage() {
  return (
    <Page>
      <PageHeader
        eyebrow="complydoc for teams"
        title="A safe way for your team's agents to read documents."
        art={<CloudArt />}
        lead="People hand contracts, invoices and CVs to AI agents every day, whole. complydoc sits between any agent and your team's documents: through MCP, agents find, check and read them with personal data masked and hidden instructions removed, and the file never leaves the computer."
      >
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <a href="#contact">
                Ask for a pilot
                <ArrowRightIcon data-icon="inline-end" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={links.assistant}>
                <BookOpenIcon data-icon="inline-start" />
                How it works
              </a>
            </Button>
          </div>
          <ul aria-label="Works with" className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium">
            {AGENTS.map((agent) => (
              <li key={agent.name} className="flex items-center gap-2">
                <BrandLogo brand={agent.brand} className="size-4" />
                {agent.name}
              </li>
            ))}
          </ul>
        </div>
      </PageHeader>

      <Section
        id="mcp"
        eyebrow="Over MCP"
        title="One layer between every agent and your documents."
        lead="complydoc speaks MCP, so any agent that does can use it. The agent asks complydoc for a document instead of taking the file, and gets what is safe to read."
      >
        <div className="flex flex-col gap-16">
          <Facts items={CAN} />
          <figure className="flex flex-col gap-3">
            <pre className="overflow-x-auto rounded-lg border bg-card p-6 font-mono text-sm leading-7 whitespace-pre-wrap">
              {VERDICT}
            </pre>
            <figcaption className="text-sm text-muted-foreground">
              What an agent is told about a file of sample invoices, before anyone shares it.
            </figcaption>
          </figure>
          <div className="border-t pt-12">
            <Facts items={KEEPS} />
          </div>
        </div>
      </Section>

      <Section
        id="offer"
        eyebrow="What you get"
        title="Free for every person. Managed for the whole team."
        lead="The MCP server is open source and runs on each person's computer. complydoc for teams adds what a company needs to roll it out, and is built with the first teams that pilot it."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <Offer title="Open source" badge="Free" items={TODAY} />
          <Offer title="complydoc for teams" badge="Early access" items={FOR_TEAMS} highlight />
        </div>
      </Section>

      <Section id="questions" eyebrow="Before you ask" title="What security teams ask first.">
        <dl className="grid gap-x-16 gap-y-10 md:grid-cols-2">
          {QUESTIONS.map((item) => (
            <div key={item.q} className="flex flex-col gap-2">
              <dt className="text-lg font-medium">{item.q}</dt>
              <dd className="text-pretty text-muted-foreground">
                {item.a} <TextLink href={item.href}>More</TextLink>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-16 text-pretty text-muted-foreground">
          Building pipelines that load documents for a model? That is{" "}
          <TextLink href="../">complydoc for engineers</TextLink>: loaders compared, every step traced, and what must
          survive tested in CI.
        </p>
      </Section>

      <Section
        id="contact"
        eyebrow="Talk to us"
        title="Ask for a pilot."
        lead="Tell us which agents your team uses and what documents go into them. A pilot starts on a few people's computers and ends with what your security team needs to roll it out."
      >
        <div className="grid gap-8 lg:grid-cols-[5fr_6fr]">
          <p className="text-pretty text-muted-foreground">
            Messages go straight to the maintainer, at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-foreground underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <ContactForm />
        </div>
      </Section>
    </Page>
  );
}

/** Three ideas side by side, each with its icon, as the home page shows the trace's. */
function Facts({ items }: { items: { icon: LucideIcon; title: string; detail: string }[] }) {
  return (
    <dl className="grid gap-10 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className="flex gap-4">
          <item.icon className="mt-1 size-5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-2">
            <dt className="text-lg font-medium">{item.title}</dt>
            <dd className="text-pretty text-muted-foreground">{item.detail}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

function Offer({
  title,
  badge,
  items,
  highlight = false,
}: {
  title: string;
  badge: string;
  items: string[];
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "bg-primary-soft" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {title}
          <Badge variant={highlight ? "outline" : "secondary"} className={highlight ? "bg-card" : undefined}>
            {badge}
          </Badge>
        </CardTitle>
        <CardDescription>
          {highlight ? "For companies where security decides what agents may read." : "Everything one person needs."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          {items.map((item) => (
            <Item key={item} size="sm" className="px-0">
              <ItemMedia variant="icon">
                <CheckIcon aria-hidden className="text-primary" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="font-normal">{item}</ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
      {highlight && (
        <CardFooter className="mt-auto">
          <Button className="bg-card" variant="outline" asChild>
            <a href="#contact">
              Ask for a pilot
              <ArrowRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
