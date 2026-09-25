import { BrandLogo } from "@/components/BrandLogo";
import type { Brand } from "@/lib/logos";

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

function Row({ label, providers, more }: { label: string; providers: Provider[]; more: string }) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-0">
      <p className="shrink-0 text-sm text-muted-foreground xl:w-36">{label}</p>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-4 text-sm font-medium lg:flex-nowrap lg:whitespace-nowrap">
        {providers.map((provider) => (
          <li key={provider.name} className="flex items-center gap-2">
            <BrandLogo brand={provider.brand} className="size-5" />
            {provider.name}
          </li>
        ))}
        <li className="text-muted-foreground">{more}</li>
      </ul>
    </div>
  );
}

export function Providers() {
  return (
    <section aria-label="Works with" className="border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <Row label="Loaders" providers={LOADERS} more="and more" />
        <Row label="Model providers" providers={MODELS} more="and more" />
      </div>
    </section>
  );
}
