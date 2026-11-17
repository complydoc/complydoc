import {
  ArrowRightIcon,
  CheckIcon,
  FileSearchIcon,
  FolderOpenIcon,
  MessageSquareTextIcon,
  ShieldCheckIcon,
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

/** Assistants that run complydoc's MCP server on the person's own computer today. */
const ASSISTANTS: { name: string; brand: Brand }[] = [
  { name: "Claude", brand: "claude" },
  { name: "Codex", brand: "codex" },
  { name: "Cursor", brand: "cursor" },
  { name: "GitHub Copilot", brand: "githubcopilot" },
  { name: "Gemini CLI", brand: "gemini" },
  { name: "Any MCP client", brand: "mcp" },
];

const STEPS = [
  {
    icon: FolderOpenIcon,
    title: "Install it once",
    detail:
      "Open the extension in Claude Desktop and pick the folders your documents are in. Nothing else to install.",
  },
  {
    icon: MessageSquareTextIcon,
    title: "Ask for the document",
    detail:
      "Instead of attaching a file: “Open the Acme proposal and summarise it.” Another folder is one click away, from the conversation.",
  },
  {
    icon: ShieldCheckIcon,
    title: "The assistant reads a clean copy",
    detail:
      "Bank accounts, tax numbers and names come back masked, hidden instructions are taken out, and the assistant says what was removed.",
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
  "The extension for Claude Desktop, and setup for Codex, Cursor, Copilot in VS Code and Gemini CLI",
  "A verdict anyone understands: ready to send, send with care, or do not send as it is",
  "Personal and financial details masked, and text hidden from a reader taken out",
  "Only the folders a person picks, and no network connection while documents are read",
];

const FOR_TEAMS = [
  "Installed for everyone by IT, with the folders and what counts as sensitive set once",
  "A record of what each assistant read, and what was masked, for audit",
  "A server inside your network, for the assistants that only reach one: Microsoft 365 Copilot and ChatGPT",
  "Your shared drives and SharePoint as the folders, with the documents left where they are",
];

const QUESTIONS = [
  {
    q: "Do our documents leave the computer?",
    a: "The file never does. complydoc reads it on the person's computer, with outbound connections blocked, and only the cleaned text joins the conversation they were already having with the assistant.",
    href: links.offline,
  },
  {
    q: "Can the assistant open any file it likes?",
    a: "No. It reads only from folders the person picked, in their computer's own folder dialog. The model can ask for the dialog, never choose what it lands on.",
    href: links.assistant,
  },
  {
    q: "What if someone attaches the file anyway?",
    a: "Then it reaches the assistant whole: complydoc is the safe way in, not a lock. Where that must not happen, turn file uploads off in the assistant's admin settings and leave complydoc as the way documents come in.",
    href: links.assistant,
  },
  {
    q: "What is the licence?",
    a: "MIT, for the extension and the engine under it. You can read every line that touches your documents.",
    href: links.github,
  },
];


export function EnterprisePage() {
  return (
    <Page>
      <PageHeader
        eyebrow="complydoc for teams"
        title="Let your team's AI assistants read documents safely."
        art={<CloudArt />}
        lead="People send contracts, invoices and CVs to Claude and Copilot every day, whole. complydoc sits between any assistant and your team's documents: it hands over the text with personal data masked and hidden instructions removed, and the file never leaves the computer."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <a href="#contact">
                Ask for a pilot
                <ArrowRightIcon data-icon="inline-end" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={links.assistant}>
                <FileSearchIcon data-icon="inline-start" />
                Try the extension
              </a>
            </Button>
          </div>
          <ul aria-label="Works with" className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-medium">
            {ASSISTANTS.map((assistant) => (
              <li key={assistant.name} className="flex items-center gap-2">
                <BrandLogo brand={assistant.brand} className="size-4" />
                {assistant.name}
              </li>
            ))}
          </ul>
        </div>
      </PageHeader>

      <Section id="how" eyebrow="How it works" title="Nothing new to learn. The assistant asks complydoc first.">
        <div className="grid gap-8 lg:grid-cols-[6fr_5fr]">
          <ol className="flex flex-col gap-6">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card">
                  <step.icon aria-hidden className="size-4 text-primary" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="font-medium">
                    <span className="text-muted-foreground">{index + 1}. </span>
                    {step.title}
                  </p>
                  <p className="text-sm text-pretty text-muted-foreground">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <figure className="flex flex-col gap-2">
            <pre className="overflow-x-auto rounded-lg border bg-card p-4 font-mono text-xs leading-6 whitespace-pre-wrap">
              {VERDICT}
            </pre>
            <figcaption className="text-xs text-muted-foreground">
              What the assistant is told about a file of sample invoices, before anyone shares it.
            </figcaption>
          </figure>
        </div>
      </Section>

      <Section id="offer" eyebrow="What you get" title="Free for every person today. Managed for the whole team next.">
        <div className="grid gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                Open source
                <Badge variant="secondary">Free</Badge>
              </CardTitle>
              <CardDescription>Everything one person needs, on their own computer.</CardDescription>
            </CardHeader>
            <CardContent>
              <Checklist items={TODAY} />
            </CardContent>
            <CardFooter className="mt-auto">
              <Button variant="outline" asChild>
                <a href={links.assistant}>
                  Set it up
                  <ArrowRightIcon data-icon="inline-end" />
                </a>
              </Button>
            </CardFooter>
          </Card>
          <Card className="bg-primary-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                complydoc for teams
                <Badge variant="outline" className="bg-card">
                  Early access
                </Badge>
              </CardTitle>
              <CardDescription>
                For companies where security decides what assistants may read. Built with the first teams that pilot it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Checklist items={FOR_TEAMS} />
            </CardContent>
            <CardFooter className="mt-auto">
              <Button className="bg-card" variant="outline" asChild>
                <a href="#contact">
                  Ask for a pilot
                  <ArrowRightIcon data-icon="inline-end" />
                </a>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </Section>

      <Section id="questions" eyebrow="Before you ask" title="What security teams ask first.">
        <dl className="grid gap-8 md:grid-cols-2">
          {QUESTIONS.map((item) => (
            <div key={item.q} className="flex flex-col gap-2 border-t pt-4">
              <dt className="font-medium">{item.q}</dt>
              <dd className="text-sm text-pretty text-muted-foreground">
                {item.a} <TextLink href={item.href}>More</TextLink>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-sm text-pretty text-muted-foreground">
          Building pipelines that load documents for a model? That is{" "}
          <TextLink href="../">complydoc for engineers</TextLink>: loaders compared, every step traced, and what must
          survive tested in CI.
        </p>
      </Section>

      <Section id="contact" eyebrow="Talk to us" title="Ask for a pilot.">
        <div className="grid gap-8 lg:grid-cols-[5fr_6fr]">
          <div className="flex flex-col gap-4">
            <p className="text-pretty text-muted-foreground">
              Tell us which assistants your team uses and what documents go into them. A pilot starts with complydoc on
              a few people's computers and ends with what your security team needs to roll it out.
            </p>
            <p className="text-sm text-pretty text-muted-foreground">
              Messages go straight to the maintainer, at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-foreground underline underline-offset-4">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </div>
          <ContactForm />
        </div>
      </Section>
    </Page>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
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
  );
}
