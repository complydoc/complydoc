import { ArrowRightIcon, BugIcon, CoffeeIcon, FileTextIcon, IdCardIcon, TerminalIcon } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { Section, TextLink } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
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
        <ItemGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {contributors.contributors.map((person) => (
            <Item key={person.login} variant="outline" className="bg-card" asChild>
              <a href={person.url}>
                <ItemMedia variant="image" className="rounded-full">
                  <img src={avatar(person.login)} alt="" width={40} height={40} />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>@{person.login}</ItemTitle>
                </ItemContent>
              </a>
            </Item>
          ))}
        </ItemGroup>
        <p className="mt-4 text-xs text-muted-foreground">From GitHub on {contributors.as_of}. Bots are left out.</p>
      </Section>

      <Section id="start" eyebrow="Your first contribution" title="From a clone to a pull request.">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
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

      <Section id="issues" eyebrow="Good first issues" title="A good place to start.">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-lg">Issues labelled for a first contribution</CardTitle>
            <CardDescription>
              Issues marked as a good place to start. Most of them add an identifier complydoc should
              recognise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href={links.goodFirstIssues}>
                See the good first issues on GitHub
                <ArrowRightIcon data-icon="inline-end" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </Section>

      <Section id="ways" eyebrow="Other ways to help" title="Not all of it is code.">
        <div className="grid gap-4 md:grid-cols-2">
          {WAYS.map((way) => (
            <Card key={way.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <way.icon aria-hidden className="size-4 text-primary" />
                  {way.title}
                </CardTitle>
                <CardDescription className="text-pretty">{way.text}</CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <TextLink href={way.href}>{way.more}</TextLink>
              </CardFooter>
            </Card>
          ))}
        </div>
      </Section>
    </Page>
  );
}
