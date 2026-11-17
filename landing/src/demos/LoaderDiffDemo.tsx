import { CheckIcon, CircleAlertIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type FactResult, LOADER_DEMO, type LoaderPage, demoImage } from "@/demos/data";
import { type Token, wordDiff } from "@/lib/wordDiff";
import { cn } from "@/lib/utils";

const LOADERS = LOADER_DEMO.loaders;
const FIRST_PAGE = LOADER_DEMO.pages[0] as LoaderPage;

/** Pick a page and two loaders; read what each returned, with the words only one has marked. */
export function LoaderDiffDemo() {
  const [pageId, setPageId] = useState(FIRST_PAGE.id);
  const [left, setLeft] = useState("PyPDFLoader");
  const [right, setRight] = useState("PDFPlumberLoader");
  const page = LOADER_DEMO.pages.find((p) => p.id === pageId) ?? FIRST_PAGE;
  const diff = useMemo(() => wordDiff(page.texts[left] ?? "", page.texts[right] ?? ""), [page, left, right]);

  return (
    <div className="flex flex-col gap-6 rounded-3xl border bg-muted/50 p-4 md:p-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium">1. Choose a page</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {LOADER_DEMO.pages.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === page.id}
              onClick={() => setPageId(option.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card p-2 text-left text-sm transition-colors outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50",
                option.id === page.id && "border-primary bg-primary-soft",
              )}
            >
              <img
                src={demoImage(option.image)}
                alt=""
                className="h-12 w-9 shrink-0 rounded-sm border bg-white object-cover object-top"
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{option.title}</span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {option.file.replace(/\.pdf$/, "")} · p.{option.page}
                </span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-3 text-sm font-medium">2. Choose two loaders</legend>
        <LoaderPicker label="Left" value={left} onChange={setLeft} />
        <LoaderPicker label="Right" value={right} onChange={setRight} />
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <figure className="flex flex-col gap-2">
          <figcaption className="flex h-6 items-center text-xs text-muted-foreground">The page, as a person sees it</figcaption>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <img
              src={demoImage(page.image)}
              width={page.width}
              height={page.height}
              alt={`${page.file}, page ${page.page}. ${page.story}`}
              className="h-auto w-full"
            />
          </div>
          <p className="text-sm text-pretty text-muted-foreground">{page.story}</p>
        </figure>
        <Reading name={left} tokens={diff.left} only={diff.onlyLeft} empty={!page.texts[left]?.trim()} />
        <Reading name={right} tokens={diff.right} only={diff.onlyRight} empty={!page.texts[right]?.trim()} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">
            Same words, in the same order: <span className="tabular-nums">{Math.round(diff.similarity * 100)}%</span>
          </p>
          <p className="text-sm text-muted-foreground">
            The passage this page has to keep:{" "}
            <q className="font-mono text-xs text-foreground">{page.fact.text}</q>
          </p>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {LOADERS.map((loader) => (
              <FactRow key={loader.name} loader={loader.name} result={page.fact.found[loader.name] ?? null} />
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">Identifiers that depend on the loader</p>
          {page.identifier_differences.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              On this page every loader that read text found the same identifiers.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {page.identifier_differences.map((difference) => (
                <li key={difference.value} className="flex flex-col gap-0.5">
                  <span>
                    <span className="text-muted-foreground">{difference.label}: </span>
                    <code className="rounded bg-warning-soft px-1 font-mono text-xs">{difference.value}</code>
                  </span>
                  <span className="text-xs text-muted-foreground">read by {difference.found_by.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-pretty text-muted-foreground">
        What LangChain's loaders returned for these pages, run through{" "}
        <code className="font-mono">cd.compare_loaders</code> in complydoc {LOADER_DEMO.complydoc}. Marked words are
        the ones the other reading does not have at that point.
      </p>
    </div>
  );
}

function LoaderPicker({ label, value, onChange }: { label: string; value: string; onChange: (name: string) => void }) {
  return (
    <div role="radiogroup" aria-label={`${label} loader`} className="flex flex-wrap items-center gap-1.5">
      <span className="w-12 text-xs text-muted-foreground">{label}</span>
      {LOADERS.map((loader) => (
        <button
          key={loader.name}
          type="button"
          role="radio"
          aria-checked={loader.name === value}
          onClick={() => onChange(loader.name)}
          className={cn(
            "rounded-lg border bg-card px-2.5 py-1 font-mono text-xs transition-colors outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50",
            loader.name === value && "border-primary bg-primary text-primary-foreground hover:border-primary",
          )}
        >
          {loader.name}
        </button>
      ))}
    </div>
  );
}

function Reading({ name, tokens, only, empty }: { name: string; tokens: Token[]; only: number; empty: boolean }) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="flex h-6 items-center justify-between gap-2 text-xs">
        <span className="font-mono font-medium">{name}</span>
        <span className="text-muted-foreground tabular-nums">
          {empty ? "no text" : `${only} ${only === 1 ? "word" : "words"} only here`}
        </span>
      </figcaption>
      <ScrollArea className="h-[26rem] rounded-xl border bg-card shadow-sm lg:h-[32rem]">
        {empty ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nothing. The page is a picture, and this loader reads only a text layer, so the model would be given an
            empty page.
          </p>
        ) : (
          <pre className="p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
            {tokens.map((token, index) =>
              token.changed ? (
                <mark key={index} className="rounded-sm bg-warning-soft text-foreground ring-1 ring-warning/40">
                  {token.text}
                </mark>
              ) : (
                <span key={index}>{token.text}</span>
              ),
            )}
          </pre>
        )}
      </ScrollArea>
    </figure>
  );
}

const FACT: Record<"exact" | "fuzzy" | "lost", { label: string; icon: typeof CheckIcon; tone: string }> = {
  exact: { label: "kept it", icon: CheckIcon, tone: "text-success" },
  fuzzy: { label: "a near miss", icon: CircleAlertIcon, tone: "text-warning" },
  lost: { label: "lost it", icon: XIcon, tone: "text-destructive" },
};

function FactRow({ loader, result }: { loader: string; result: FactResult }) {
  const fact = FACT[result ?? "lost"];
  const Icon = fact.icon;
  return (
    <li className="flex items-start gap-1.5 text-xs">
      <Icon aria-hidden className={cn("mt-px size-3.5 shrink-0", fact.tone)} />
      <span>
        <span className="font-mono">{loader}</span> <span className="text-muted-foreground">{fact.label}</span>
      </span>
    </li>
  );
}
