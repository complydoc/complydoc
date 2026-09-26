import { MessageCircleQuestionIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Section, TextLink } from "@/components/Section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInView } from "@/hooks/useInView";
import { links } from "@/links";
import { cn } from "@/lib/utils";
import { CostAnswer, FileTypeAnswer, MaskAnswer, SectionAnswer, VisionAnswer } from "./Answers";

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
      "Only for the pages that need it. The page router sends a page to a vision model when its text layer would lose content, such as a table with stacked headers or a scan too coarse for OCR.",
    body: <VisionAnswer />,
    more: { label: "Page routing", href: links.routing },
  },
  {
    value: "section",
    question: "Why can't I see section 7 of the document in my RAG results?",
    answer:
      "Your loader may have split it. On two-column pages, some loaders read each line across both columns, so a section ends up mixed into the one beside it.",
    body: <SectionAnswer />,
    more: { label: "Comparing loaders", href: links.compareLoaders },
  },
  {
    value: "file-types",
    question: "Which loader should I use for the PDFs, and which for the Word files?",
    answer:
      "complydoc gives each loader only the file types it reads, compares them one type at a time, and names a loader for each. A PDF loader is not marked as failing on a spreadsheet.",
    body: <FileTypeAnswer />,
    more: { label: "Several file types", href: links.compareFileTypes },
  },
  {
    value: "cost",
    question: "How much would it cost to process this whole folder using Sonnet 5?",
    answer:
      "complydoc counts the tokens in the folder and prices them for every model, from the text layer and as page images.",
    body: <CostAnswer />,
    more: { label: "Audit a folder", href: links.docs },
  },
  {
    value: "mask",
    question: "Do we have values in the documents that should be masked before ingestion?",
    answer:
      "complydoc finds personal and financial identifiers and hidden instructions, then masks them in your pipeline or in copies of the files.",
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
    >
      <Tabs ref={ref} defaultValue="vision" orientation="vertical" className="flex-col gap-6 lg:flex-row">
        <TabsList variant="line" className="h-fit w-full shrink-0 items-stretch gap-2 lg:w-96">
          {QUESTIONS.map((q, i) => (
            <TabsTrigger
              key={q.value}
              value={q.value}
              style={{ animationDelay: `${i * 180}ms` }}
              className={cn(
                "h-auto justify-start gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm whitespace-normal after:hidden data-active:border-primary/40 data-active:bg-card",
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
