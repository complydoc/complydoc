import { ArrowRightIcon, CheckIcon, CloudIcon, MailIcon, ServerIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { CloudArt } from "@/art/CloudArt";
import { CopyButton } from "@/components/CopyButton";
import { Section, TextLink } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CONTACT_EMAIL, links } from "@/links";
import { Page, PageHeader } from "@/pages/Page";

const SELF_HOSTED = [
  { text: "The container image audits a folder of documents and serves the viewer", href: links.container },
  { text: "One viewer for the whole team, behind the sign-in you already have", href: links.team },
  { text: "A policy that fails the build when a document breaks it", href: links.policy },
  { text: "The network blocked while documents are read, and each report saying so", href: links.offline },
];

const DEMO = [
  "Your loaders compared on documents like yours, page by page",
  "Hidden text and personal data found, and where they would be masked",
  "How it would run in your infrastructure: the container, the viewer and the gate in CI",
];

const QUESTIONS = [
  {
    q: "Do our documents leave our network?",
    a: "No. complydoc runs where you run it, with outbound connections blocked while documents are read, and every report records that they were.",
    href: links.offline,
  },
  {
    q: "Who can see the reports?",
    a: "Whoever your identity provider lets through. complydoc has no accounts of its own: the viewer sits behind your proxy and reads the reports folder read-only.",
    href: links.team,
  },
  {
    q: "What is the licence?",
    a: "MIT, for the package, the viewer and the container image. You can read every line that touches your documents.",
    href: links.github,
  },
  {
    q: "We use Java, not Python.",
    a: "complydoc4j writes the same report, from a folder or a LangChain4j ingestion, and is checked against this package on every change.",
    href: links.java,
  },
];

const INTERESTS = [
  { id: "demo", label: "A demo of self-hosted complydoc" },
  { id: "cloud", label: "Early access to the cloud version" },
  { id: "other", label: "Something else" },
] as const;

export function EnterprisePage() {
  return (
    <Page>
      <PageHeader
        eyebrow="For companies"
        title="complydoc inside your company, on your own infrastructure."
        art={<CloudArt />}
        lead="Audit documents before they reach a model, with the viewer, the policy gate and the audit itself running on your servers and nothing sent outside. Tell us about your documents and we will show you complydoc on ones like them."
      >
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <a href="#contact">
              Ask for a demo
              <ArrowRightIcon data-icon="inline-end" />
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href={`mailto:${CONTACT_EMAIL}`}>
              <MailIcon data-icon="inline-start" />
              {CONTACT_EMAIL}
            </a>
          </Button>
        </div>
      </PageHeader>

      <Section id="offer" eyebrow="Two ways to run it" title="Self-hosted today. A cloud version is on its way.">
        <div className="grid gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ServerIcon aria-hidden className="size-5 text-primary" />
                Self-hosted
              </CardTitle>
              <CardDescription>
                Everything complydoc does, on machines you run. The documents, the reports and the people who can read
                them all stay where your security team already looks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ItemGroup className="gap-2">
                {SELF_HOSTED.map((item) => (
                  <Item key={item.text} size="sm" asChild>
                    <a href={item.href}>
                      <ItemMedia variant="icon">
                        <CheckIcon aria-hidden className="text-primary" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle className="font-normal">{item.text}</ItemTitle>
                      </ItemContent>
                    </a>
                  </Item>
                ))}
              </ItemGroup>
            </CardContent>
            <CardFooter>
              <div className="flex w-full items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2 font-mono text-xs">
                <span className="text-muted-foreground select-none">$</span>
                <span className="truncate">docker pull ghcr.io/complydoc/complydoc</span>
                <span className="ml-auto">
                  <CopyButton text="docker pull ghcr.io/complydoc/complydoc" label="Copy the pull command" />
                </span>
              </div>
            </CardFooter>
          </Card>
          <Card className="bg-primary-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CloudIcon aria-hidden className="size-5 text-primary" />
                complydoc Cloud
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm text-pretty text-muted-foreground">
              <p>
                For teams that would rather not run it themselves. We are starting on a hosted version now, and the
                companies that tell us what they need are the ones it is being built around.
              </p>
              <p>
                Ask for early access and tell us what you would send it, how much of it, and what your security team
                will want to know.
              </p>
            </CardContent>
            <CardFooter className="mt-auto">
              <Button variant="outline" className="bg-card" asChild>
                <a href="#contact">
                  Ask for early access
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
      </Section>

      <Section id="contact" eyebrow="Talk to us" title="Ask for a demo.">
        <div className="grid gap-8 lg:grid-cols-[5fr_6fr]">
          <div className="flex flex-col gap-4">
            <p className="text-pretty text-muted-foreground">A demo walks through:</p>
            <ItemGroup className="gap-2">
              {DEMO.map((item) => (
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

/**
 * A form that writes the email for you. The site is static, so nothing is sent
 * from it: submitting opens the reader's mail app with the message filled in.
 */
function ContactForm() {
  const [interest, setInterest] = useState<string>("demo");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const topic = INTERESTS.find((i) => i.id === interest)?.label ?? "";
    const subject = `${topic}: ${value("company")}`;
    const body = [
      value("message"),
      "",
      `Name: ${value("name")}`,
      `Company: ${value("company")}`,
      `Email: ${value("email")}`,
    ].join("\n");
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium" id="interest-label">
              What would you like?
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={2}
              value={interest}
              onValueChange={(value) => value && setInterest(value)}
              aria-labelledby="interest-label"
              className="flex-wrap"
            >
              {INTERESTS.map((option) => (
                <ToggleGroupItem key={option.id} value={option.id} className="px-4">
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Name
                <Input name="name" required autoComplete="name" />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Company
                <Input name="company" required autoComplete="organization" />
              </label>
            </div>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Work email
              <Input name="email" type="email" required autoComplete="email" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Your documents and what you do with them
              <Textarea
                name="message"
                rows={5}
                required
                placeholder="Contracts and invoices, about 50,000 pages a month, indexed for an internal assistant."
              />
            </label>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Opens your email app with the message written. Nothing is sent from this page.
            </p>
            <Button type="submit" className="shrink-0">
              <MailIcon data-icon="inline-start" />
              Write the email
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
