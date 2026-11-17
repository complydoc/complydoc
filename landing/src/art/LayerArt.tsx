import { ArrowRightIcon, ArrowDownIcon, CheckIcon, FileTextIcon, FolderIcon } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Logo } from "@/components/Logo";
import type { Brand } from "@/lib/logos";

/** A few of the sample documents complydoc ships with, and what it finds in each. */
const DOCUMENTS: { name: string; finding: string }[] = [
  { name: "rechnungen-2026-de.pdf", finding: "3 IBANs, 3 tax numbers" },
  { name: "vendor-due-diligence.pdf", finding: "A hidden instruction to AI" },
  { name: "employee-handbook.pdf", finding: "5 National Insurance numbers" },
  { name: "supplier-invoices-scanned.pdf", finding: "Scanned, read with OCR" },
];

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
          <ul className="flex flex-col gap-2">
            <li className="flex items-center gap-2 text-sm font-medium">
              <FolderIcon className="size-4 text-muted-foreground" />
              contracts-and-invoices/
            </li>
            {DOCUMENTS.map((doc) => (
              <li key={doc.name} className="flex items-start gap-2 pl-4">
                <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-xs">{doc.name}</span>
                  <span className="text-xs text-muted-foreground">{doc.finding}</span>
                </span>
              </li>
            ))}
            <li className="pl-10 text-xs text-muted-foreground">and 96 more</li>
          </ul>
        </Column>

        <Link label="Originals" />

        <div className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-2">
            <Logo size={20} />
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">On your computer</span>
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
      <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="flex-1">{children}</div>
      <p className="border-t pt-3 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/** The hand-off between two columns: a line with what crosses it. */
function Link({ label, strong = false }: { label: string; strong?: boolean }) {
  const tone = strong ? "text-primary-ink" : "text-muted-foreground";
  return (
    <div className={`flex items-center justify-center gap-2 py-1 lg:flex-col lg:py-0 ${tone}`}>
      <span className="font-mono text-[11px] tracking-wide whitespace-nowrap uppercase">{label}</span>
      <ArrowRightIcon className="hidden size-4 lg:block" />
      <ArrowDownIcon className="size-4 lg:hidden" />
    </div>
  );
}
