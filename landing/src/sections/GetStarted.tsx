import { CodeBlock, Source } from "@/components/CodeBlock";
import { copyable } from "@/lib/code";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { links } from "@/links";

const WORKS_WITH = [
  { name: "LangChain", href: "https://github.com/langchain-ai/langchain" },
  { name: "LlamaIndex", href: "https://github.com/run-llama/llama_index" },
  { name: "Unstructured", href: "https://github.com/Unstructured-IO/unstructured" },
  { name: "Docling", href: "https://github.com/docling-project/docling" },
  { name: "LlamaParse", href: "https://github.com/run-llama/llama_cloud_services" },
  { name: "Azure Document Intelligence", href: "https://learn.microsoft.com/azure/ai-services/document-intelligence/" },
];

const START = `$ uv tool install complydoc
$ complydoc demo              # a report on the bundled samples
$ complydoc audit ./documents
$ complydoc doctor            # what a run can't see, and why`;

const EXTRAS = [
  { name: "ocr", size: "~80 MB", adds: "Reads scans and images" },
  { name: "ner", size: "~50 MB", adds: "Names with spaCy's small English model" },
  { name: "multilingual-names", size: "~2 GB", adds: "People and companies in European languages" },
];

export function GetStarted() {
  return (
    <Section id="start" label="get started" title="Run it on a folder you already have">
      <div className="grid gap-10 *:min-w-0 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <CodeBlock title="shell" copy={copyable(START.replace(/ +#.*$/gm, ""))}>
            <Source code={START} />
          </CodeBlock>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={links.docs}>Documentation</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={links.playground}>Playground examples</a>
            </Button>
            <Button variant="ghost" asChild>
              <a href={links.pypi}>PyPI</a>
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Optional extras</h3>
            <ul className="flex flex-col divide-y rounded-lg border bg-card text-sm">
              {EXTRAS.map((extra) => (
                <li key={extra.name} className="grid grid-cols-[10rem_4rem_1fr] gap-3 px-4 py-3">
                  <code className="font-mono text-xs">{extra.name}</code>
                  <span className="font-mono text-xs text-faint">{extra.size}</span>
                  <span className="text-muted-foreground">{extra.adds}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Works with</h3>
            <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {WORKS_WITH.map((tool) => (
                <a key={tool.name} href={tool.href} className="hover:text-foreground">
                  {tool.name}
                </a>
              ))}
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
