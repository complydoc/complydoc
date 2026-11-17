import {
  ArrowRightIcon,
  CheckIcon,
  EyeOffIcon,
  FileSearchIcon,
  FileLockIcon,
  FileScanIcon,
  GaugeIcon,
  HardDriveIcon,
  ScaleIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UserRoundXIcon,
  type LucideIcon,
} from "lucide-react";
import { LayerArt } from "@/art/LayerArt";
import { Section, TextLink } from "@/components/Section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { CONTACT_EMAIL, links } from "@/links";
import { ContactForm } from "@/pages/ContactForm";
import { Page } from "@/pages/Page";

const BADGES: { icon: LucideIcon; label: string }[] = [
  { icon: HardDriveIcon, label: "Cleaned on your computer" },
  { icon: ShieldIcon, label: "Any assistant that speaks MCP" },
  { icon: ScaleIcon, label: "MIT licensed" },
];

/** What happens to every document on its way to a model. */
const LAYER: { icon: LucideIcon; title: string; detail: string }[] = [
  {
    icon: UserRoundXIcon,
    title: "Personal data masked",
    detail: "Bank accounts, tax and insurance numbers, emails and names, masked before the text leaves complydoc.",
  },
  {
    icon: EyeOffIcon,
    title: "Prompt injection taken out",
    detail: "Text a person cannot see, such as white or tiny text, is removed, and instructions written to an AI are flagged.",
  },
  {
    icon: GaugeIcon,
    title: "AI readiness checked",
    detail: "Which documents a model can read well, which are scanned, and what would make the rest usable.",
  },
  {
    icon: FileScanIcon,
    title: "Loaded efficiently",
    detail: "complydoc's own loader is on by default: text where there is text, OCR only where a page is scanned.",
  },
];

/** What an assistant can do through complydoc's MCP server. */
const CAN: { icon: LucideIcon; title: string; detail: string }[] = [
  {
    icon: FileSearchIcon,
    title: "Find a document",
    detail: "By part of its name, in the folders a person shared, and nowhere else.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Say if it is safe to share",
    detail: "Ready to send, send with care, or do not send as it is, with what the verdict rests on.",
  },
  {
    icon: FileLockIcon,
    title: "Read the clean copy",
    detail: "With a note of what was masked and removed, so the assistant knows what it is missing.",
  },
];

const TODAY = [
  "The MCP server, for any assistant that speaks MCP",
  "Masking, prompt injection removal and the verdict, on every document",
  "AI readiness of a folder, and complydoc's loader",
  "Only folders a person picks, with no network while documents are read",
];

const FOR_TEAMS = [
  "Rolled out by IT, with folders and what counts as sensitive set once for everyone",
  "A record of what each assistant read, and what was masked, for audit",
  "A server inside your network, for assistants that only reach a remote one",
  "Shared drives and SharePoint as the folders, with documents left where they are",
];

const QUESTIONS = [
  {
    q: "Do our documents leave the computer?",
    a: "The file never does. complydoc reads it where it is, with outbound connections blocked, and only the cleaned text joins the conversation.",
    href: links.offline,
  },
  {
    q: "Can the assistant open any file it likes?",
    a: "No. It reads only from folders a person picked in their computer's own folder dialog, or that IT set for the team.",
    href: links.assistant,
  },
  {
    q: "What if someone attaches the file anyway?",
    a: "Then it reaches the assistant whole: complydoc is the safe way in, not a lock. Where that must not happen, turn uploads off in the assistant's admin settings.",
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
      <section id="top" aria-labelledby="page-title">
        <div className="mx-auto flex max-w-6xl flex-col gap-16 px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="grid gap-10 md:grid-cols-2 md:gap-16">
            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-4">
                <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">complydoc for teams</p>
                <h1 id="page-title" className="text-5xl font-medium tracking-tight text-balance md:text-6xl">
                  Share documents with AI, safely.
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" asChild>
                  <a href="#contact">
                    Ask for early access
                    <ArrowRightIcon data-icon="inline-end" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#layer">How it works</a>
                </Button>
              </div>
            </div>
            <div className="flex flex-col justify-between gap-10">
              <p className="text-xl text-pretty md:pt-9">
                Your team gives contracts, invoices and CVs to AI assistants every day. complydoc sits between
                those documents and the models: each one is cleaned on your computer, and the assistant only
                ever reads the clean copy.
              </p>
              <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
                {BADGES.map((badge) => (
                  <li key={badge.label} className="flex items-center gap-2">
                    <badge.icon className="size-4" />
                    {badge.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <LayerArt />
        </div>
      </section>

      <Section
        id="layer"
        eyebrow="The layer"
        title="What happens to every document."
      >
        <Facts items={LAYER} columns="md:grid-cols-2" />
      </Section>

      <Section
        id="mcp"
        eyebrow="Over MCP"
        title="Works with the assistants your team already uses."
      >
        <Facts items={CAN} />
      </Section>

      <Section
        id="offer"
        eyebrow="What you get"
        title="Free for every person. Managed for the whole team."
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
        <p className="mt-16 border-t pt-8 text-pretty text-muted-foreground">
          Building pipelines that load documents for a model? That is{" "}
          <TextLink href="../">complydoc for engineers</TextLink>: loaders compared, every step traced, and what must
          survive tested in CI.
        </p>
      </Section>

      <Section
        id="contact"
        eyebrow="Talk to us"
        title="Ask for early access."
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
function Facts({
  items,
  columns = "md:grid-cols-3",
}: {
  items: { icon: LucideIcon; title: string; detail: string }[];
  columns?: string;
}) {
  return (
    <dl className={`grid gap-10 ${columns}`}>
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
          {highlight ? "For companies where security decides what assistants may read." : "Everything one person needs."}
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
              Ask for early access
              <ArrowRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
