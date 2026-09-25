import { MessageCircleQuestionIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Section, TextLink } from "@/components/Section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInView } from "@/hooks/useInView";
import { links } from "@/links";
import { cn } from "@/lib/utils";
import { CostAnswer, MaskAnswer, SectionAnswer, VisionAnswer } from "./Answers";

interface Question {
  value: string;
  question: string;
  answer: string;
  body: ReactNode;
  more: { label: string; href: string };
}

const QUESTIONS: Question[] = [
  {
    value: "vision",
    question: "Should I use vision for this document?",
    answer:
      "For 4 of its 33 pages. The page router reads every page and gives each one the cheapest route that still reads it: page 3 of the annual report has a table with stacked headers, and the invoices were scanned at 150 dpi, too coarse for OCR.",
    body: <VisionAnswer />,
    more: { label: "Page routing", href: links.routing },
  },
  {
    value: "section",
    question: "Why can't I see section 7 of the document in my RAG results?",
    answer:
      "Because your loader never produced it as one passage. On page 4 of the contract, pdfplumber reads across both columns, so the heading and clause 7.1 are spliced into section 6.",
    body: <SectionAnswer />,
    more: { label: "Comparing loaders", href: links.compareLoaders },
  },
  {
    value: "cost",
    question: "How much would it cost to process this whole folder using Sonnet 5?",
    answer:
      "$0.036 from the text layer, $0.106 as page images, $0.048 routed page by page. At 20,000 documents a month, $1,725 or $4,224 a year. Every other model is priced on the same tokens.",
    body: <CostAnswer />,
    more: { label: "Audit a folder", href: links.docs },
  },
  {
    value: "mask",
    question: "Do we have values in the documents that should be masked before ingestion?",
    answer:
      "Yes: 42 identifiers in 4 of 6 documents, 11 confirmed by checksum, and one hidden instruction. complydoc masks them in your pipeline, or writes clean copies of the files.",
    body: <MaskAnswer />,
    more: { label: "Identifiers it finds", href: links.identifiers },
  },
];

export function Questions() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <Section
      id="questions"
      eyebrow="What it answers"
      title="The questions you get asked after something goes wrong, answered before ingestion."
      lead="Each answer below is what complydoc reports on the sample folder."
    >
      <Tabs ref={ref} defaultValue="vision" orientation="vertical" className="flex-col gap-6 lg:flex-row">
        <TabsList variant="line" className="h-fit w-full shrink-0 items-stretch gap-2 lg:w-96">
          {QUESTIONS.map((q, i) => (
            <TabsTrigger
              key={q.value}
              value={q.value}
              style={{ animationDelay: `${i * 180}ms` }}
              className={cn(
                "h-auto justify-start gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm whitespace-normal data-active:border-primary/40 data-active:bg-card",
                seen ? "animate-in fill-mode-both fade-in slide-in-from-bottom-3 duration-500" : "opacity-0",
                "motion-reduce:animate-none motion-reduce:opacity-100",
              )}
            >
              <MessageCircleQuestionIcon className="mt-0.5 self-start text-muted-foreground" />
              {q.question}
            </TabsTrigger>
          ))}
        </TabsList>
        {QUESTIONS.map((q) => (
          <TabsContent key={q.value} value={q.value} className="min-w-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{q.question}</CardTitle>
                <CardDescription className="text-base">{q.answer}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {q.body}
                <p className="text-sm text-muted-foreground">
                  More in <TextLink href={q.more.href}>{q.more.label}</TextLink>.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </Section>
  );
}
