import { CheckIcon, FileTextIcon, FolderIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { Logo } from "@/components/Logo";
import type { Brand } from "@/lib/logos";

/** A few of the sample documents complydoc ships with. */
const DOCUMENTS = ["contract.pdf", "invoices-2026.pdf", "cv-candidate.pdf", "handbook.docx"];

/** What complydoc does to every document before an assistant sees it. */
const STEPS = [
  "Personal and financial details masked",
  "Hidden instructions taken out",
  "Read with complydoc's loader, OCR where needed",
  "A verdict: ready, with care, or not as it is",
];

/** Assistants that speak MCP, and so read documents through complydoc. */
const ASSISTANTS: { name: string; brand: Brand }[] = [
  { name: "Claude", brand: "claude" },
  { name: "Codex", brand: "codex" },
  { name: "Cursor", brand: "cursor" },
  { name: "GitHub Copilot", brand: "githubcopilot" },
  { name: "Windsurf", brand: "windsurf" },
  { name: "Gemini", brand: "gemini" },
  { name: "Any MCP client", brand: "mcp" },
];

/**
 * complydoc as a layer: the team's documents on the left, the assistants on the right,
 * and complydoc between them, so only the clean copy crosses over.
 */
export function LayerArt() {
  return (
    <figure className="showcase-backdrop flex flex-col gap-6 rounded-2xl border p-4 sm:p-8 md:p-14">
      <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1.1fr_auto_1fr] lg:gap-4">
        <Column label="Your documents" note="The originals stay on the computer">
          <ul className="flex flex-col gap-3">
            <li className="flex items-center gap-2 text-sm font-medium">
              <FolderIcon className="size-4 text-muted-foreground" />
              Team documents
            </li>
            {DOCUMENTS.map((name) => (
              <li key={name} className="flex items-center gap-2 pl-4 text-sm">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                {name}
              </li>
            ))}
            <li className="pl-10 text-sm text-muted-foreground">+ 96 more</li>
          </ul>
        </Column>

        <Link label="Originals" />

        <div className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-2">
            <Logo size={20} />
            <span className="text-sm text-muted-foreground">On your computer</span>
          </div>
          <ul className="flex flex-col gap-3">
            {STEPS.map((step) => (
              <li key={step} className="flex items-start gap-2 text-sm">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary-ink" />
                {step}
              </li>
            ))}
          </ul>
        </div>

        <Link label="Clean copies only" strong />

        <Column label="Your assistants" note="They never see the original">
          <ul className="grid grid-cols-2 gap-x-3 gap-y-3 lg:grid-cols-1">
            {ASSISTANTS.map((assistant) => (
              <li key={assistant.name} className="flex items-center gap-2 text-sm font-medium">
                <BrandLogo brand={assistant.brand} className="size-4" />
                {assistant.name}
              </li>
            ))}
          </ul>
        </Column>
      </div>
      <figcaption className="text-center text-sm text-muted-foreground">
        A folder of a hundred documents goes in. Each one is cleaned locally, and only the clean text reaches the model.
      </figcaption>
    </figure>
  );
}

function Column({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex-1">{children}</div>
      <p className="border-t pt-3 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/** The hand-off between two columns: what crosses, on a line that ends in an arrowhead. */
function Link({ label, strong = false }: { label: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-row items-center justify-center gap-3 py-2 lg:flex-col lg:py-0",
        strong ? "text-primary" : "text-muted-foreground/50",
      )}
    >
      <span
        className={cn(
          "rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
          strong ? "border-primary/60 bg-primary-soft text-primary-ink" : "bg-card text-muted-foreground",
        )}
      >
        {label}
      </span>
      {/* Across on a wide screen, down when the columns stack. */}
      <svg viewBox="0 0 96 12" className="hidden h-3 w-24 lg:block" aria-hidden>
        <circle cx="3" cy="6" r="2.5" fill="currentColor" />
        <path d="M3 6H92" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M86 1.5L92.5 6L86 10.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg viewBox="0 0 12 40" className="h-10 w-3 lg:hidden" aria-hidden>
        <circle cx="6" cy="3" r="2.5" fill="currentColor" />
        <path d="M6 3V36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M1.5 30.5L6 37L10.5 30.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
