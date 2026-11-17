import { CheckIcon, CircleAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LOADER_DEMO, type LoaderPage, demoImage } from "@/demos/data";
import { type Token, wordDiff } from "@/lib/wordDiff";
import { cn } from "@/lib/utils";

const PAGE = LOADER_DEMO.pages[0] as LoaderPage;
const [LEFT, RIGHT] = LOADER_DEMO.loaders.map((l) => l.name) as [string, string];

/**
 * The order each loader read the page in, drawn over it: down one column and
 * then the other, or straight across both. A sketch of what the two texts
 * below show, in fractions of the page.
 */
const ROWS = [0.14, 0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.84];
const LINES: Record<string, [number, number, number, number][]> = {
  [LEFT]: [
    [0.13, 0.13, 0.13, 0.9],
    [0.55, 0.13, 0.55, 0.9],
  ],
  [RIGHT]: ROWS.map((y) => [0.1, y, 0.9, y]),
};

/** One two-column page, two loaders: what each returned, and the order it read the page in. */
export function LoaderDiffDemo() {
  const [focus, setFocus] = useState(RIGHT);
  const diff = useMemo(() => wordDiff(PAGE.texts[LEFT] ?? "", PAGE.texts[RIGHT] ?? ""), []);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{PAGE.file}</span>, page {PAGE.page}
        </p>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={2}
          value={focus}
          onValueChange={(value) => value && setFocus(value)}
          aria-label="Loader"
        >
          {[LEFT, RIGHT].map((name) => (
            <ToggleGroupItem key={name} value={name} className="px-2.5 font-mono text-xs">
              {name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <figure className="relative hidden self-start overflow-hidden rounded-lg border bg-white sm:block">
          <img
            src={demoImage(PAGE.image)}
            width={PAGE.width}
            height={PAGE.height}
            alt={`${PAGE.file}, page ${PAGE.page}: ${PAGE.story}`}
            className="h-auto w-full opacity-80"
          />
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden
            className="absolute inset-0 size-full"
          >
            {LINES[focus]?.map(([x1, y1, x2, y2], index) => (
              <line
                key={`${focus}-${index}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-primary/80"
              />
            ))}
          </svg>
          <figcaption className="absolute inset-x-0 bottom-0 bg-card/90 px-2 py-1 text-[10px] text-muted-foreground">
            Reading order
          </figcaption>
        </figure>
        <Reading
          tokens={focus === LEFT ? diff.left : diff.right}
          tone={focus === LEFT ? "lost" : "added"}
        />
      </div>

      <ul className="grid gap-2 text-xs sm:grid-cols-2">
        {[LEFT, RIGHT].map((name) => {
          const kept = PAGE.fact.found[name] === "exact";
          const Icon = kept ? CheckIcon : CircleAlertIcon;
          return (
            <li key={name} className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <Icon aria-hidden className={cn("mt-px size-3.5 shrink-0", kept ? "text-success" : "text-warning")} />
              <span>
                <span className="font-mono">{name}</span>{" "}
                <span className="text-muted-foreground">
                  {kept ? "kept clause 1.1 whole" : "split clause 1.1 with the other column"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The viewer's diff marks: lost words on the left reading, added ones on the right. */
const MARK = { lost: "bg-destructive-soft", added: "bg-success-soft" } as const;

function Reading({ tokens, tone }: { tokens: Token[]; tone: keyof typeof MARK }) {
  return (
    <ScrollArea className="h-56 rounded-lg border bg-muted/30">
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
    </ScrollArea>
  );
}
