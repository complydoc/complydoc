import { CoinsIcon, FileWarningIcon, ShieldAlertIcon, TimerIcon, type LucideIcon } from "lucide-react";
import { Section } from "@/components/Section";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface Issue {
  area: string;
  icon: LucideIcon;
  figure: string;
  headline: string;
  detail: string;
  source: string;
}

/**
 * Measured on the six sample documents in viewer/sample/documents (33 pages):
 * `complydoc audit`, `complydoc cost -m claude-sonnet-5 --monthly-volume 20000`,
 * and `cd.compare_loaders` with LangChain's PyPDFLoader and PDFPlumberLoader.
 */
const ISSUES: Issue[] = [
  {
    area: "Content",
    icon: FileWarningIcon,
    figure: "30%",
    headline: "of words in common, two loaders, one contract",
    detail:
      "On the two-column contract, pdfplumber reads straight across both columns, so sections 6 and 7 alternate line by line. pypdf keeps them apart. Both return text that looks fine.",
    source: "master-services-agreement.pdf, page 4",
  },
  {
    area: "Time",
    icon: TimerIcon,
    figure: "13×",
    headline: "slower, for readings half a point apart",
    detail:
      "pdfplumber took 3.2 s over the 33 pages and pypdf 0.24 s. Their readiness scores were 93.7 and 93.2. Whether the slower one is worth it depends on your documents, and now you can tell.",
    source: "compare_loaders, both through LangChain",
  },
  {
    area: "Cost",
    icon: CoinsIcon,
    figure: "2.9×",
    headline: "the price, sending pages as images",
    detail:
      "Claude Sonnet 5 on the folder: $0.036 from the text layer, $0.106 as page images. At 20,000 documents a month that is $1,725 against $4,224 a year, and only 4 of the 33 pages need a vision model.",
    source: "complydoc cost -m claude-sonnet-5",
  },
  {
    area: "Security",
    icon: ShieldAlertIcon,
    figure: "42",
    headline: "identifiers in 4 of 6 documents",
    detail:
      "11 of them confirmed by checksum: IBANs, a card number, National Insurance and German tax numbers. And one line of white text telling AI assistants to approve the vendor without review.",
    source: "complydoc audit, Security",
  },
];

export function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="Most pipelines pick a loader once, and never look at what it read."
      lead={
        <>
          You try PyPDFLoader in a notebook, the first page looks right, and it ships. From then on it decides what your
          model sees: which clauses survive, which tables turn to word soup, which identifiers get embedded, and which
          pages you pay a vision model for. None of it shows up until an answer is wrong. complydoc makes that choice
          visible, on four counts.
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ISSUES.map((issue) => (
          <Card key={issue.area}>
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <issue.icon className="size-4" />
                {issue.area}
              </CardDescription>
              <CardTitle className="flex flex-col gap-1">
                <span className="text-4xl font-semibold tracking-tight">{issue.figure}</span>
                <span className="text-sm font-medium text-muted-foreground">{issue.headline}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 text-sm text-muted-foreground">{issue.detail}</CardContent>
            <CardFooter>
              <p className="font-mono text-xs text-muted-foreground">{issue.source}</p>
            </CardFooter>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Every figure on this page is from the six sample documents in the repository: 33 synthetic pages, every
        identifier invented or a published test value.
      </p>
    </Section>
  );
}
