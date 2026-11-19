import { ArrowRightIcon } from "lucide-react";
import { TextLink } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import contributors from "@/data/contributors.json";
import { links } from "@/links";
import { Page } from "@/pages/Page";

const AVATARS = import.meta.glob<string>("@/assets/contributors/*.png", { eager: true, import: "default" });

const avatar = (login: string) => Object.entries(AVATARS).find(([path]) => path.endsWith(`/${login}.png`))?.[1];

const MAINTAINER = "duartecaldascardoso";

const WAYS = [
  {
    title: "Teach it a new identifier",
    text: "A national ID, a tax number, a health number. Most good first issues are one of these.",
    href: links.identifiers,
    more: "Identifiers it finds",
  },
  {
    title: "Show us a document it reads wrong",
    text: "A loader that drops a table, or a page it calls clean that is not. A description is enough to start.",
    href: links.newIssue,
    more: "Open an issue",
  },
  {
    title: "Make the docs clearer",
    text: "Every guide runs its examples in the tests, so a fix to a guide is checked like a fix to the code.",
    href: links.docs,
    more: "The docs",
  },
  {
    title: "Work on complydoc4j",
    text: "complydoc for Java writes the same report, and is checked against this package on every change.",
    href: links.java,
    more: "From Java",
  },
];

export function ContributorsPage() {
  const people = contributors.contributors;
  return (
    <Page>
      <section id="top" aria-labelledby="page-title">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 pt-24 pb-20 text-center md:pt-32">
          <div className="flex -space-x-3" aria-hidden>
            {people.slice(0, 7).map((person) => (
              <img
                key={person.login}
                src={avatar(person.login)}
                alt=""
                width={48}
                height={48}
                className="size-12 rounded-full border-2 border-background bg-muted"
              />
            ))}
          </div>
          <h1 id="page-title" className="max-w-4xl text-5xl font-medium tracking-tight text-balance md:text-7xl">
            Built in the open
          </h1>
          <p className="max-w-2xl text-xl text-pretty text-muted-foreground">
            complydoc is MIT licensed and made by {people.length} people so far. Every pull request is read, and a first
            one is welcome.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
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
        </div>
      </section>

      <section id="people" aria-labelledby="people-title">
        <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 pb-24 md:pb-32">
          <Separator />
          <h2 id="people-title" className="text-3xl font-medium tracking-tight md:text-4xl">
            Contributors
          </h2>
          <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((person) => (
              <li key={person.login}>
                <a href={person.url} className="group flex items-start gap-4">
                  <img
                    src={avatar(person.login)}
                    alt=""
                    width={56}
                    height={56}
                    className="size-14 shrink-0 rounded-full bg-muted"
                  />
                  <span className="flex min-w-0 flex-col gap-1 pt-1">
                    <span className="truncate text-lg font-medium group-hover:underline group-hover:underline-offset-4">
                      @{person.login}
                    </span>
                    <span className="text-pretty text-muted-foreground">
                      {person.login === MAINTAINER ? "Maintainer" : person.latest}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="ways" aria-labelledby="ways-title">
        <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 pb-24 md:pb-32">
          <Separator />
          <div className="grid gap-6 md:grid-cols-2 md:gap-16">
            <h2 id="ways-title" className="text-3xl font-medium tracking-tight md:text-4xl">
              Ways to help
            </h2>
            <p className="text-lg text-pretty text-muted-foreground md:pt-1">
              Comment on an issue to be assigned, keep a pull request to one issue with a test, and open it into{" "}
              <code className="font-mono text-base">development</code>. Everyone whose work ships is thanked in the
              release notes. More in <TextLink href={links.contributing}>CONTRIBUTING.md</TextLink>.
            </p>
          </div>
          <dl className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {WAYS.map((way) => (
              <div key={way.title} className="flex flex-col gap-2">
                <dt className="text-lg font-medium">{way.title}</dt>
                <dd className="flex flex-col gap-3 text-pretty text-muted-foreground">
                  {way.text}
                  <TextLink href={way.href}>{way.more}</TextLink>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </Page>
  );
}
