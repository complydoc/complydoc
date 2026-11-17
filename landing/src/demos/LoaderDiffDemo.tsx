import { CheckIcon, CircleAlertIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
    <div className="flex flex-col gap-8 rounded-2xl border bg-muted/50 p-4 md:p-8">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium">1. Choose a page</p>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={4}
          value={page.id}
          onValueChange={(value) => value && setPageId(value)}
          aria-label="Page"
          className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {LOADER_DEMO.pages.map((option) => (
            <ToggleGroupItem
              key={option.id}
              value={option.id}
              className="h-auto justify-start gap-4 bg-card p-4 text-left whitespace-normal"
            >
              <img src={demoImage(option.image)} alt="" className="h-12 w-9 shrink-0 rounded-sm border bg-white object-cover object-top" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{option.title}</span>
                <span className="text-xs font-normal text-muted-foreground">page {option.page}</span>
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium">2. Choose two loaders</p>
        <div className="flex flex-wrap items-center gap-4">
          <LoaderSelect label="Left" value={left} onChange={setLeft} />
          <span className="text-sm text-muted-foreground">against</span>
          <LoaderSelect label="Right" value={right} onChange={setRight} />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-4">
        <figure className="flex flex-col gap-4">
          <figcaption className="text-xs text-muted-foreground">The page, as a person sees it</figcaption>
          <div className="overflow-hidden rounded-xl border bg-white">
            <img
              src={demoImage(page.image)}
              width={page.width}
              height={page.height}
              alt={`${page.file}, page ${page.page}. ${page.story}`}
              className="h-auto w-full"
            />
          </div>
          <p className="text-sm text-pretty text-muted-foreground">
            {page.story} <span className="font-mono text-xs">{page.file}</span>, page {page.page}.
          </p>
        </figure>
        <Reading name={left} tokens={diff.left} only={diff.onlyLeft} tone="lost" empty={!page.texts[left]?.trim()} />
        <Reading name={right} tokens={diff.right} only={diff.onlyRight} tone="added" empty={!page.texts[right]?.trim()} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>The passage this page has to keep</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <q className="font-mono text-xs">{page.fact.text}</q>
            <ItemGroup className="grid gap-2 sm:grid-cols-2">
              {LOADERS.map((loader) => (
                <FactItem key={loader.name} loader={loader.name} result={page.fact.found[loader.name] ?? null} />
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Identifiers that depend on the loader</CardTitle>
          </CardHeader>
          <CardContent>
            {page.identifier_differences.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                On this page every loader that read text found the same identifiers.
              </p>
            ) : (
              <ItemGroup className="gap-2">
                {page.identifier_differences.map((difference) => (
                  <Item key={difference.value} variant="muted" size="sm">
                    <ItemContent>
                      <ItemTitle>
                        {difference.label}
                        <code className="font-mono text-xs font-normal">{difference.value}</code>
                      </ItemTitle>
                      <ItemDescription>Read by {difference.found_by.join(", ")}</ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-pretty text-muted-foreground">
        What LangChain's loaders returned for these pages, run through{" "}
        <code className="font-mono">cd.compare_loaders</code> in complydoc {LOADER_DEMO.complydoc}. Same words in the
        same order: <span className="tabular-nums">{Math.round(diff.similarity * 100)}%</span>. Marked words are the
        ones the other reading does not have at that point.
      </p>
    </div>
  );
}

function LoaderSelect({ label, value, onChange }: { label: string; value: string; onChange: (name: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={`${label} loader`} className="min-w-52 bg-card font-mono text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOADERS.map((loader) => (
          <SelectItem key={loader.name} value={loader.name} className="font-mono text-xs">
            {loader.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The viewer's diff marks: lost words on the left, added ones on the right. */
const MARK = { lost: "bg-destructive-soft", added: "bg-success-soft" } as const;

function Reading({
  name,
  tokens,
  only,
  tone,
  empty,
}: {
  name: string;
  tokens: Token[];
  only: number;
  tone: keyof typeof MARK;
  empty: boolean;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-4">
      <figcaption className="flex items-center justify-between gap-4 text-xs">
        <span className="font-mono font-medium">{name}</span>
        <span className="text-muted-foreground tabular-nums">
          {empty ? "no text" : `${only} ${only === 1 ? "word" : "words"} only here`}
        </span>
      </figcaption>
      <ScrollArea className="h-[26rem] rounded-xl border bg-card lg:h-[32rem]">
        {empty ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No text</EmptyTitle>
              <EmptyDescription>
                The page is a picture and this loader reads only a text layer, so the model would be given an empty
                page.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <pre className="p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
            {tokens.map((token, index) =>
              token.changed ? (
                <mark key={index} className={cn("rounded-sm text-foreground", MARK[tone])}>
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
  exact: { label: "Kept it", icon: CheckIcon, tone: "text-success" },
  fuzzy: { label: "A near miss", icon: CircleAlertIcon, tone: "text-warning" },
  lost: { label: "Lost it", icon: XIcon, tone: "text-destructive" },
};

function FactItem({ loader, result }: { loader: string; result: FactResult }) {
  const fact = FACT[result ?? "lost"];
  const Icon = fact.icon;
  return (
    <Item variant="muted" size="sm">
      <ItemMedia variant="icon">
        <Icon aria-hidden className={fact.tone} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="font-mono text-xs">{loader}</ItemTitle>
        <ItemDescription>{fact.label}</ItemDescription>
      </ItemContent>
    </Item>
  );
}
