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
      "Only for 4 of its 33 pages. The page router checks each page and picks the cheapest route that still extracts it. Page 3 of the annual report has a table with stacked headers, which plain text loses. The invoices were scanned at 150 dpi, below the 200 dpi OCR needs.",
    body: <VisionAnswer />,
    more: { label: "Page routing", href: links.routing },
  },
  {
    value: "section",
    question: "Why can't I see section 7 of the document in my RAG results?",
    answer:
      "Your loader never extracted it as one passage. Page 4 of the contract has two columns, and pdfplumber reads each line across both. The section 7 heading ends up after a section 6 sentence, and clause 7.1 is interleaved with 6.1 and 6.2.",
    body: <SectionAnswer />,
    more: { label: "Comparing loaders", href: links.compareLoaders },
  },
  {
    value: "cost",
    question: "How much would it cost to process this whole folder using Sonnet 5?",
    answer:
      "$0.036 from the text layer, $0.106 as page images, or $0.048 routed by page. At 20,000 documents a month, that is $1,725 or $4,224 a year. The same token counts price every other model in the table.",
    body: <CostAnswer />,
    more: { label: "Audit a folder", href: links.docs },
  },
  {
    value: "mask",
    question: "Do we have values in the documents that should be masked before ingestion?",
    answer:
      "Yes. 42 identifiers in 4 of the 6 documents, 11 of them validated by checksum, plus one hidden instruction. complydoc can mask them inside your pipeline or write masked copies of the files.",
    body: <MaskAnswer />,
    more: { label: "Identifiers it finds", href: links.identifiers },
  },
];

export function Questions() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <Section
      id="questions"
      eyebrow="Questions"
      title="Questions it answers before ingestion"
      lead="Each answer comes from complydoc's report on the sample folder."
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
