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
    headline: "word overlap between two loaders on one contract",
    detail:
      "The contract has two columns. pdfplumber reads each line across both, so sections 6 and 7 are interleaved. pypdf reads column by column. Neither reports an error.",
    source: "master-services-agreement.pdf, page 4",
  },
  {
    area: "Time",
    icon: TimerIcon,
    figure: "13×",
    headline: "slower loader, similar output",
    detail:
      "pdfplumber took 3.2 s for the 33 pages and pypdf took 0.24 s. Their readiness scores were 93.7 and 93.2.",
    source: "compare_loaders, both through LangChain",
  },
  {
    area: "Cost",
    icon: CoinsIcon,
    figure: "2.9×",
    headline: "cost of sending every page as an image",
    detail:
      "Claude Sonnet 5, whole folder: $0.036 from the text layer, $0.106 as images. At 20,000 documents a month, $1,725 or $4,224 a year. Only 4 of the 33 pages need a vision model.",
    source: "complydoc cost -m claude-sonnet-5",
  },
  {
    area: "Security",
    icon: ShieldAlertIcon,
    figure: "42",
    headline: "identifiers in 4 of 6 documents",
    detail:
      "11 validated by checksum, including IBANs, a payment card number, UK National Insurance numbers and German tax IDs. One page also has white text telling AI assistants to approve the vendor.",
    source: "complydoc audit, Security",
  },
];

export function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="Loaders are usually chosen without checking what they extract."
      lead={
        <>
          The choice is often made in a notebook: load a PDF, read the first page, move on. After that, the loader
          decides which clauses reach the index, whether tables keep their structure, which identifiers get embedded,
          and which pages go to a vision model. complydoc measures each of these on your own files. These are the
          numbers for the six sample documents in the repository.
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
        All figures on this page come from those samples: 33 synthetic pages, with every identifier invented or a
        published test value.
      </p>
    </Section>
  );
}
