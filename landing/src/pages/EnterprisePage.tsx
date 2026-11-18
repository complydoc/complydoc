import {
  ArrowRightIcon,
  CheckIcon,
  EyeOffIcon,
  GaugeIcon,
  HardDriveIcon,
  ScaleIcon,
  ShieldIcon,
  UserRoundXIcon,
  type LucideIcon,
} from "lucide-react";
import { LayerArt } from "@/art/LayerArt";
import { Section, TextLink } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL } from "@/links";
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
    detail:
      "Bank accounts, tax numbers, emails and names, before the text reaches a model.",
  },
  {
    icon: EyeOffIcon,
    title: "Prompt injection removed",
    detail:
      "Text a person cannot see is taken out, and instructions written to an AI are flagged.",
  },
  {
    icon: GaugeIcon,
    title: "AI readiness checked",
    detail:
      "Which documents a model can read well, and which are scanned or need work.",
  },
];

/** What the team version adds to the open-source one. */
const FOR_TEAMS = [
  "Set up once by IT, for everyone",
  "A record of what each assistant read",
  "Shared drives and SharePoint as folders",
];

export function EnterprisePage() {
  return (
    <Page>
      <section id="top" aria-labelledby="page-title">
        <div className="mx-auto flex max-w-6xl flex-col gap-16 px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="flex max-w-3xl flex-col gap-8">
            <h1
              id="page-title"
              className="text-5xl font-medium tracking-tight text-balance md:text-6xl"
            >
              Share documents with AI, safely.
            </h1>
            <p className="text-xl text-pretty text-muted-foreground">
              complydoc sits between your documents and any AI assistant. Each
              file is cleaned on your computer, and the assistant only reads the
              clean copy.
            </p>
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
            <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
              {BADGES.map((badge) => (
                <li key={badge.label} className="flex items-center gap-2">
                  <badge.icon className="size-4" />
                  {badge.label}
                </li>
              ))}
            </ul>
          </div>
          <LayerArt />
        </div>
      </section>

      <Section id="layer" title="What happens to every document.">
        <dl className="grid gap-10 md:grid-cols-3">
          {LAYER.map((item) => (
            <div key={item.title} className="flex gap-4">
              <item.icon className="mt-1 size-5 shrink-0 text-muted-foreground" />
              <div className="flex flex-col gap-2">
                <dt className="text-lg font-medium">{item.title}</dt>
                <dd className="text-pretty text-muted-foreground">
                  {item.detail}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="contact" title="Ask for early access.">
        <div className="grid gap-8 lg:grid-cols-[5fr_6fr]">
          <div className="flex flex-col gap-6">
            <p className="text-pretty text-muted-foreground">
              The open-source version is free for every person. The team version
              adds:
            </p>
            <ul className="flex flex-col gap-3">
              {FOR_TEAMS.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckIcon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-pretty text-muted-foreground">
              Messages go straight to the maintainer, at{" "}
              <TextLink href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </TextLink>
              .
            </p>
          </div>
          <ContactForm />
        </div>
      </Section>
    </Page>
  );
}
