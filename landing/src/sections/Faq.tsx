import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Section, TextLink } from "@/components/Section";
import { links } from "@/links";

const QUESTIONS: { question: string; answer: ReactNode }[] = [
  {
    question: "Does complydoc send my documents anywhere?",
    answer: (
      <>
        No. It runs on your machine, blocks the network while documents are read, and records in each report that it
        did. Three things reach a network, and only when you ask: a hosted parser you compare, a vision model of your
        own you verify pages with, and a bucket you name for the reports.{" "}
        <TextLink href={links.offline}>How offline is kept</TextLink>.
      </>
    ),
  },
  {
    question: "Does observing slow my pipeline down?",
    answer: (
      <>
        Your pipeline's own calls run as they would. complydoc reads what each step returned once the block ends, and
        every trace shows how long that took, beside the pipeline's own time.
      </>
    ),
  },
  {
    question: "How is this different from agent observability?",
    answer: (
      <>
        Agent observability starts at the model call: prompts, tool calls, cost per answer. complydoc covers what
        happens before that, when documents become text and text becomes chunks. An agent can only know what the
        pipeline read, so the two are used together.
      </>
    ),
  },
  {
    question: "Which loaders and frameworks does it work with?",
    answer: (
      <>
        LangChain and LlamaIndex pipelines are traced as they run. Any loader with <code>load()</code>,{" "}
        <code>load_data()</code> or <code>lazy_load()</code> can be inspected, as can any function that returns
        documents, and there are presets for Docling, Unstructured, LlamaParse and Azure Document Intelligence.
      </>
    ),
  },
  {
    question: "Do I need an account, an API key or a server?",
    answer: (
      <>
        No. It is a Python package and a command. The viewer is served from your machine by{" "}
        <code>complydoc ui</code>, and a team can serve it from a <TextLink href={links.container}>container</TextLink>.
      </>
    ),
  },
  {
    question: "What does it cost?",
    answer: <>Nothing. complydoc is open source under the MIT licence.</>,
  },
];

export function Faq() {
  return (
    <Section id="faq" eyebrow="Questions" title="Asked before installing.">
      <div className="flex max-w-3xl flex-col">
        {QUESTIONS.map((item) => (
          <details key={item.question} className="group border-b first:border-t">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
              {item.question}
              <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-6 text-pretty text-muted-foreground [&_code]:font-mono [&_code]:text-sm [&_code]:text-foreground">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
