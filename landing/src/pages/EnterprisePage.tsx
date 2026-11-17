import { ArrowRightIcon, CheckIcon, CloudIcon, MailIcon, ServerIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Section, TextLink } from "@/components/Section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL, links } from "@/links";
import { cn } from "@/lib/utils";
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
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="flex flex-col gap-5 rounded-3xl border bg-card p-8 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <ServerIcon aria-hidden className="size-6 text-primary" />
              <Badge variant="success">Available now</Badge>
            </div>
            <h3 className="text-2xl font-semibold tracking-tight">Self-hosted</h3>
            <p className="text-pretty text-muted-foreground">
              Everything complydoc does, on machines you run. The documents, the reports and the people who can read
              them all stay where your security team already looks.
            </p>
            <ul className="flex flex-col gap-2.5 text-sm">
              {SELF_HOSTED.map((item) => (
                <li key={item.text} className="flex gap-2">
                  <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <a href={item.href} className="hover:text-primary hover:underline">
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs">
              <span className="text-muted-foreground select-none">$</span>
              <span className="truncate">docker pull ghcr.io/complydoc/complydoc</span>
              <span className="ml-auto">
                <CopyButton text="docker pull ghcr.io/complydoc/complydoc" label="Copy the pull command" />
              </span>
            </div>
          </article>
          <article className="flex flex-col gap-5 rounded-3xl border bg-primary-soft p-8">
            <div className="flex items-center justify-between gap-3">
              <CloudIcon aria-hidden className="size-6 text-primary" />
              <Badge variant="outline">Early access</Badge>
            </div>
            <h3 className="text-2xl font-semibold tracking-tight">complydoc Cloud</h3>
            <p className="text-pretty text-muted-foreground">
              For teams that would rather not run it themselves. We are starting on a hosted version now, and the
              companies that tell us what they need are the ones it is being built around.
            </p>
            <p className="text-pretty text-muted-foreground">
              Ask for early access and tell us what you would send it, how much of it, and what your security team
              will want to know.
            </p>
            <Button variant="outline" className="mt-auto w-fit bg-card" asChild>
              <a href="#contact">
                Ask for early access
                <ArrowRightIcon data-icon="inline-end" />
              </a>
            </Button>
          </article>
        </div>
      </Section>

      <Section id="questions" eyebrow="Before you ask" title="What security teams ask first.">
        <dl className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {QUESTIONS.map((item) => (
            <div key={item.q} className="flex flex-col gap-2 border-t pt-5">
              <dt className="font-medium">{item.q}</dt>
              <dd className="text-sm text-pretty text-muted-foreground">
                {item.a} <TextLink href={item.href}>More</TextLink>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="contact" eyebrow="Talk to us" title="Ask for a demo.">
        <div className="grid gap-10 lg:grid-cols-[5fr_6fr]">
          <div className="flex flex-col gap-5">
            <p className="text-pretty text-muted-foreground">A demo walks through:</p>
            <ul className="flex flex-col gap-3">
              {DEMO.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
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

const FIELD =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * A form that writes the email for you. The site is static, so nothing is sent
 * from it: submitting opens the reader's mail app with the message filled in.
 */
function ContactForm() {
  const [interest, setInterest] = useState<(typeof INTERESTS)[number]["id"]>("demo");

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
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border bg-card p-6 shadow-sm md:p-8">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">What would you like?</legend>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((option) => (
            <label
              key={option.id}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                interest === option.id ? "border-primary bg-primary-soft" : "hover:border-primary",
              )}
            >
              <input
                type="radio"
                name="interest"
                value={option.id}
                checked={interest === option.id}
                onChange={() => setInterest(option.id)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <input name="name" required autoComplete="name" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Company
          <input name="company" required autoComplete="organization" className={FIELD} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Work email
        <input name="email" type="email" required autoComplete="email" className={FIELD} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your documents and what you do with them
        <textarea
          name="message"
          rows={5}
          required
          placeholder="Contracts and invoices, about 50,000 pages a month, indexed for an internal assistant."
          className={cn(FIELD, "resize-y")}
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Opens your email app with the message written. Nothing is sent from this page.</p>
        <Button type="submit" size="lg" className="shrink-0">
          <MailIcon data-icon="inline-start" />
          Write the email
        </Button>
      </div>
    </form>
  );
}
