import { ArrowRightIcon, BugIcon, CoffeeIcon, FileTextIcon, IdCardIcon, TerminalIcon } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { Section, TextLink } from "@/components/Section";
import { Button } from "@/components/ui/button";
import contributors from "@/data/contributors.json";
import { links } from "@/links";
import { Page, PageHeader } from "@/pages/Page";

const AVATARS = import.meta.glob<string>("@/assets/contributors/*.png", { eager: true, import: "default" });

function avatar(login: string): string | undefined {
  return Object.entries(AVATARS).find(([path]) => path.endsWith(`/${login}.png`))?.[1];
}

/** From CONTRIBUTING.md: the setup, and the check CI runs. */
const SETUP = `git clone https://github.com/<you>/complydoc
cd complydoc
make install-all   # dependencies, optional extras and the spaCy model
make check         # lint, types and tests, as CI runs them`;

const WAYS = [
  {
    icon: IdCardIcon,
    title: "Teach it a new identifier",
    text: "A national ID, a tax number, a health number: each is a pattern and a validator, and the good first issues are mostly these.",
    href: links.identifiers,
    more: "Identifiers it finds",
  },
  {
    icon: BugIcon,
    title: "Show us a document it reads wrong",
    text: "A loader that drops a table, a page it calls clean that is not. A sample, or a description of one, is enough to start.",
    href: links.newIssue,
    more: "Open an issue",
  },
  {
    icon: FileTextIcon,
    title: "Make the docs clearer",
    text: "Every guide runs its own examples in the tests, so a fix to a guide is checked like a fix to the code.",
    href: links.docs,
    more: "The docs",
  },
  {
    icon: CoffeeIcon,
    title: "Work on complydoc4j",
    text: "complydoc for Java writes the same report, and is checked against this package on every change.",
    href: links.java,
    more: "From Java",
  },
];

export function ContributorsPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Contributors"
        title="Built in the open."
        lead="complydoc is MIT licensed and made by the people below. Every pull request is read, and a first one is welcome."
      >
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <a href={links.goodFirstIssues}>
              Find a first issue
              <ArrowRightIcon data-icon="inline-end" />
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href={links.contributing}>Read CONTRIBUTING.md</a>
          </Button>
        </div>
      </PageHeader>

      <Section id="people" eyebrow="The people" title="Everyone with a commit in complydoc.">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {contributors.contributors.map((person) => (
            <li key={person.login}>
              <a
                href={person.url}
                className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary"
              >
                <img
                  src={avatar(person.login)}
                  alt=""
                  width={48}
                  height={48}
                  className="size-12 shrink-0 rounded-full border bg-muted"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">@{person.login}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {person.commits} {person.commits === 1 ? "commit" : "commits"}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted-foreground">From GitHub on {contributors.as_of}. Bots are left out.</p>
      </Section>

      <Section id="start" eyebrow="Your first contribution" title="From a clone to a pull request.">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-pretty marker:text-muted-foreground">
              <li>Pick an issue, or open one to say what you would like to change.</li>
              <li>Fork the repository, then set it up and run the checks, as on the right.</li>
              <li>Make the change, with a test that fails without it.</li>
              <li>
                Open a pull request into <code className="font-mono text-sm">development</code>. Releases are cut from
                there.
              </li>
            </ol>
            <p className="text-sm text-muted-foreground">
              Layout, conventions and how the sample documents are made: <TextLink href={links.contributing}>CONTRIBUTING.md</TextLink>
            </p>
          </div>
          <CodeBlock title="Set up and check" icon={<TerminalIcon className="size-3.5" />} lang="bash" code={SETUP} />
        </div>
      </Section>

      <Section id="issues" eyebrow="Good first issues" title="Small, well described, and waiting.">
        {contributors.good_first_issues.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-2xl border bg-card">
            {contributors.good_first_issues.map((issue) => (
              <li key={issue.number}>
                <a href={issue.url} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/50">
                  <span className="font-mono text-sm text-muted-foreground">#{issue.number}</span>
                  <span className="font-medium">{issue.title}</span>
                  <ArrowRightIcon aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">None open right now.</p>
        )}
        <p className="mt-4 text-sm">
          <TextLink href={links.goodFirstIssues}>Every good first issue on GitHub</TextLink>
        </p>
      </Section>

      <Section id="ways" eyebrow="Other ways to help" title="Not all of it is code.">
        <ul className="grid gap-6 md:grid-cols-2">
          {WAYS.map((way) => (
            <li key={way.title} className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
              <way.icon aria-hidden className="size-5 text-primary" />
              <p className="font-medium">{way.title}</p>
              <p className="text-sm text-pretty text-muted-foreground">{way.text}</p>
              <a href={way.href} className="mt-auto text-sm font-medium hover:text-primary hover:underline">
                {way.more}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}
