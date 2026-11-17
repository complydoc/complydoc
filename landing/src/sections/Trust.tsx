import { ActivityIcon, TriangleAlertIcon, WifiOffIcon, type LucideIcon } from "lucide-react";
import traceDark from "@/assets/screens/trace-dark.webp";
import traceLight from "@/assets/screens/trace-light.webp";
import { BrandLogo } from "@/components/BrandLogo";
import { Screenshot } from "@/components/Screenshot";
import { Section } from "@/components/Section";
import type { Brand } from "@/lib/logos";

/** What the trace above shows, one idea each. */
const FACTS: { icon: LucideIcon; title: string; detail: string }[] = [
  {
    icon: ActivityIcon,
    title: "Every call, timed and priced",
    detail: "Loaders, splitters and embeddings on one time axis, with what each call took and cost.",
  },
  {
    icon: TriangleAlertIcon,
    title: "Problems where they start",
    detail: "A scan that loaded no text is flagged on the step that read it, not three steps later.",
  },
  {
    icon: WifiOffIcon,
    title: "Nothing leaves your machine",
    detail: "The network is blocked while documents are read, and every report records that it was.",
  },
];

interface Provider {
  name: string;
  brand: Brand;
}

/** Loaders with a preset or a tested integration. Any loader with load(), load_data() or lazy_load() works. */
const LOADERS: Provider[] = [
  { name: "LangChain", brand: "langchain" },
  { name: "LlamaIndex", brand: "llamaindex" },
  { name: "Docling", brand: "docling" },
  { name: "Unstructured", brand: "unstructured" },
  { name: "LlamaParse", brand: "llamaindex" },
  { name: "Azure Document Intelligence", brand: "azure" },
];

/** The providers in complydoc's price table (src/complydoc/config). */
const MODELS: Provider[] = [
  { name: "Anthropic", brand: "anthropic" },
  { name: "OpenAI", brand: "openai" },
  { name: "Gemini", brand: "gemini" },
  { name: "Mistral", brand: "mistral" },
  { name: "DeepSeek", brand: "deepseek" },
  { name: "Moonshot", brand: "kimi" },
  { name: "Z.ai", brand: "zai" },
  { name: "xAI", brand: "xai" },
];

/** Assistants that run a local MCP server, so `complydoc mcp` hands them documents cleaned. */
const ASSISTANTS: Provider[] = [
  { name: "Claude", brand: "claude" },
  { name: "Codex", brand: "codex" },
  { name: "Cursor", brand: "cursor" },
  { name: "GitHub Copilot", brand: "githubcopilot" },
  { name: "Windsurf", brand: "windsurf" },
  { name: "Gemini CLI", brand: "gemini" },
  { name: "Any MCP client", brand: "mcp" },
];

function Row({ label, providers, more }: { label: string; providers: Provider[]; more?: string }) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-0">
      <p className="shrink-0 text-sm text-muted-foreground xl:w-36">{label}</p>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-4 text-sm font-medium">
        {providers.map((provider) => (
          <li key={provider.name} className="flex items-center gap-2">
            <BrandLogo brand={provider.brand} className="size-5" />
            {provider.name}
          </li>
        ))}
        {more && <li className="text-muted-foreground">{more}</li>}
      </ul>
    </div>
  );
}

/** The viewer's trace, what it shows in three short points, then the loaders it reads, the models it prices and the assistants it serves over MCP. */
export function Trust() {
  return (
    <Section
      id="trace"
      eyebrow="Observe"
      title="Every step your pipeline takes, on one trace."
      lead="Open a run in the viewer and see what each call was given, what it returned, how long it took and what it cost."
    >
      <div className="flex flex-col gap-16">
        <Screenshot
          src={{ dark: traceDark, light: traceLight }}
          alt="The viewer's trace of an ingestion pipeline: every call on a time axis with its time, cost and identifiers, a warning on a scanned file that loaded no text, and the embedding call's input"
        />
        <dl className="grid gap-10 md:grid-cols-3">
          {FACTS.map((fact) => (
            <div key={fact.title} className="flex gap-4">
              <fact.icon className="mt-1 size-5 shrink-0 text-muted-foreground" />
              <div className="flex flex-col gap-2">
                <dt className="text-lg font-medium">{fact.title}</dt>
                <dd className="text-pretty text-muted-foreground">{fact.detail}</dd>
              </div>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-6 border-t pt-12">
          <Row label="Loaders" providers={LOADERS} more="and more" />
          <Row label="Model providers" providers={MODELS} more="and more" />
          <Row label="Assistants" providers={ASSISTANTS} />
        </div>
      </div>
    </Section>
  );
}
