import { FileCode2Icon, TerminalIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { Section, TextLink } from "@/components/Section";
import type { Lang } from "@/lib/highlight";
import { links } from "@/links";

interface Step {
  title: string;
  detail: string;
  file: string;
  icon: ReactNode;
  lang: Lang;
  code: string;
}

/** The pipeline is the one in docs/examples/observe_a_pipeline.py, with your own loader, splitter and store. */
const STEPS: Step[] = [
  {
    title: "Install",
    detail: "One tool, no service to run.",
    file: "terminal",
    icon: <TerminalIcon className="size-3.5" />,
    lang: "bash",
    code: "uv tool install complydoc",
  },
  {
    title: "Wrap your pipeline",
    detail: "The code inside the block stays as it is.",
    file: "ingest.py",
    icon: <FileCode2Icon className="size-3.5" />,
    lang: "python",
    code: `import complydoc as cd

with cd.observe("contracts-ingest"):
    documents = loader.load()
    chunks = splitter.split_documents(documents)
    vector_store.add_documents(chunks)`,
  },
  {
    title: "Open the trace",
    detail: "Every run in the folder, served from your machine.",
    file: "terminal",
    icon: <TerminalIcon className="size-3.5" />,
    lang: "bash",
    code: "complydoc ui",
  },
];

export function Quickstart() {
  return (
    <Section
      id="quickstart"
      eyebrow="Quickstart"
      title="Three steps to your first trace."
      lead="No change to your loader, your splitter or your vector store. complydoc watches the calls they make and reads what each one returned."
    >
      <ol className="grid gap-6 *:min-w-0 lg:grid-cols-[1fr_1.6fr_1fr]">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex flex-col gap-4">
            <div className="flex items-start gap-3 lg:min-h-16">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs text-primary-foreground">
                {i + 1}
              </span>
              <div className="flex flex-col">
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
              </div>
            </div>
            <CodeBlock title={step.file} icon={step.icon} lang={step.lang} code={step.code} className="grow" />
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">
        No pipeline to hand? <code className="font-mono">complydoc audit ./documents</code> reads a folder and reports
        on it. <TextLink href={links.observe}>Observing a pipeline</TextLink> has the rest.
      </p>
    </Section>
  );
}
