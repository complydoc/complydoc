import { FileTextIcon } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import type { Brand } from "@/lib/logos";

interface Provider {
  name: string;
  brand?: Brand;
}

/** The loaders complydoc reads the output of: any with load(), load_data() or lazy_load(), and these presets. */
const LOADERS: Provider[] = [
  { name: "LangChain", brand: "langchain" },
  { name: "LlamaIndex", brand: "llamaindex" },
  { name: "Docling", brand: "docling" },
  { name: "Unstructured", brand: "unstructured" },
  { name: "LlamaParse", brand: "llamaindex" },
  { name: "Azure Document Intelligence", brand: "azure" },
  { name: "pypdf" },
  { name: "pdfplumber" },
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

function Row({ label, providers }: { label: string; providers: Provider[] }) {
  return (
    <div className="grid items-center gap-4 md:grid-cols-[11rem_1fr]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <ul className="flex flex-wrap items-center gap-x-8 gap-y-4">
        {providers.map((provider) => (
          <li
            key={provider.name}
            className="group flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {provider.brand ? (
              <BrandLogo brand={provider.brand} className="size-5 grayscale transition group-hover:grayscale-0" />
            ) : (
              <FileTextIcon aria-hidden="true" className="size-5" />
            )}
            {provider.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Providers() {
  return (
    <section aria-label="Works with" className="border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <Row label="Reads what these load" providers={LOADERS} />
        <Row label="Prices and verifies with" providers={MODELS} />
      </div>
    </section>
  );
}
