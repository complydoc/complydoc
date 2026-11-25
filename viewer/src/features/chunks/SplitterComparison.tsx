import { Hint } from "@/components/Hint";
import { ToneBadge } from "@/components/ToneBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { factCounts, flaggedChunks, retrievalHitRate } from "@/report/chunks";
import { FLAG_HELP, SPREAD_HELP, flagSummary, sizeHistogram, splitterName, splitterShortName as shortName } from "@/report/chunkView";
import { formatCount, formatPercent, plural } from "@/report/format";
import type { ChunkRun } from "@/report/types";


/** How the chunks' sizes spread, smallest to largest, as a strip of bars. */
function Sizes({ run }: { run: ChunkRun }) {
  const counts = sizeHistogram(run);
  const most = Math.max(1, ...counts);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-12 items-end gap-px" aria-hidden="true">
        {counts.map((count, index) => (
          <div
            key={index}
            className="flex-1 rounded-t-sm bg-primary/70"
            style={{ height: `${count === 0 ? 0 : Math.max(6, (count / most) * 100)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{formatCount(run.stats.tokens_min)}</span>
        <span>median {formatCount(run.stats.tokens_median)} tokens</span>
        <span>{formatCount(run.stats.tokens_max)}</span>
      </div>
    </div>
  );
}

/** A share as a short bar, for a column read down the page. */
function Bar({ share, tone }: { share: number; tone: "warn" | "primary" }) {
  return (
    <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span
        className={cn("block h-full rounded-full", tone === "warn" ? "bg-warning" : "bg-primary/70")}
        style={{ width: `${Math.min(100, share * 100)}%` }}
      />
    </span>
  );
}

/**
 * Every splitter the run tried, one row each, to compare at a glance: how many chunks, how
 * big, how many cut badly, how many identifiers spread over several. A row picks the
 * splitter the rest of the page is about.
 */
export function Comparison({
  runs,
  chosen,
  best,
  onChoose,
}: {
  runs: ChunkRun[];
  chosen: string;
  best: ChunkRun | null;
  onChoose: (chunker: string) => void;
}) {
  const facts = runs.some((r) => r.facts.length > 0);
  const questions = runs.some((r) => r.retrieval.length > 0);
  const largest = Math.max(1, ...runs.map((r) => r.stats.tokens_max));
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table aria-label="Splitters compared">
        <TableHeader>
          <TableRow>
            <TableHead>Splitter</TableHead>
            <TableHead className="text-right">Chunks</TableHead>
            <TableHead>Tokens per chunk</TableHead>
            <TableHead>
              <Hint label="Chunks that stop mid-sentence or mid-table, end on a heading, or are too small or too big.">
                <span className="cursor-help underline decoration-dotted underline-offset-4">Cut badly</span>
              </Hint>
            </TableHead>
            <TableHead className="text-right">
              <Hint label={SPREAD_HELP}>
                <span className="cursor-help underline decoration-dotted underline-offset-4">Identifiers spread</span>
              </Hint>
            </TableHead>
            {facts && <TableHead className="text-right">Facts kept whole</TableHead>}
            {questions && <TableHead className="text-right">Questions answered</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const name = splitterName(run.chunker);
            const flagged = flaggedChunks(run);
            const share = run.stats.count ? flagged / run.stats.count : 0;
            const picked = run.chunker === chosen;
            const hitRate = retrievalHitRate(run);
            return (
              <TableRow
                key={run.chunker}
                data-state={picked ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => onChoose(run.chunker)}
              >
                <TableCell>
                  <button
                    type="button"
                    aria-pressed={picked}
                    aria-label={run.chunker}
                    onClick={(event) => {
                      event.stopPropagation();
                      onChoose(run.chunker);
                    }}
                    className="flex flex-col items-start gap-0.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{shortName(run)}</span>
                      {best?.chunker === run.chunker && <ToneBadge tone="good">Cuts least badly</ToneBadge>}
                    </span>
                    {name.settings.length > 0 && <span className="text-xs text-muted-foreground">{name.kind}</span>}
                  </button>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(run.stats.count)}</TableCell>
                <TableCell>
                  {/* Where the chunks' sizes run, from the smallest to the largest, on one scale for every row. */}
                  <span className="flex items-center gap-2 text-xs tabular-nums">
                    <span className="relative h-1.5 w-24 shrink-0 rounded-full bg-muted" aria-hidden="true">
                      <span
                        className="absolute inset-y-0 rounded-full bg-primary/50"
                        style={{
                          left: `${(run.stats.tokens_min / largest) * 100}%`,
                          width: `${Math.max(2, ((run.stats.tokens_max - run.stats.tokens_min) / largest) * 100)}%`,
                        }}
                      />
                      <span
                        className="absolute -inset-y-0.5 w-0.5 rounded-full bg-primary"
                        style={{ left: `${(run.stats.tokens_median / largest) * 100}%` }}
                      />
                    </span>
                    <span>
                      {formatCount(run.stats.tokens_median)}{" "}
                      <span className="text-muted-foreground">
                        ({formatCount(run.stats.tokens_min)}–{formatCount(run.stats.tokens_max)})
                      </span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 text-xs tabular-nums">
                    <Bar share={share} tone="warn" />
                    <span>
                      {formatPercent(share)} <span className="text-muted-foreground">({formatCount(flagged)})</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(Object.keys(run.repeated_identifiers).length)}
                </TableCell>
                {facts && (
                  <TableCell className="text-right tabular-nums">
                    {run.facts.length ? `${formatCount(factCounts(run).whole)} of ${formatCount(run.facts.length)}` : "–"}
                  </TableCell>
                )}
                {questions && (
                  <TableCell className="text-right tabular-nums">
                    {hitRate === null ? "–" : formatPercent(hitRate)}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** One splitter up close: how its chunks' sizes spread, and each way it cut badly, said in words. */
export function SplitterDetail({ run }: { run: ChunkRun }) {
  const flags = flagSummary(run);
  return (
    <div role="group" aria-label={run.chunker} className="grid gap-6 rounded-xl border bg-card p-4 md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-medium">How big the chunks are</h3>
        <p className="text-xs text-muted-foreground">
          {plural(run.stats.count, "chunk")}, {formatCount(run.stats.tokens_total)} tokens in all. Similar sizes make
          search results comparable; very small or very large ones stand out.
        </p>
        <Sizes run={run} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-medium">Where it cut badly</h3>
        {flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every chunk ends where a sentence or a table does.</p>
        ) : (
          <ul className="flex flex-col gap-2.5 text-sm">
            {flags.map((flag) => (
              <li key={flag.key} className="flex flex-col gap-0.5">
                <span className="flex justify-between gap-3">
                  <span>{humaniseFirst(flag.words)}</span>
                  <span className="tabular-nums">{formatCount(flag.count)}</span>
                </span>
                {FLAG_HELP[flag.key] && <span className="text-xs text-muted-foreground">{FLAG_HELP[flag.key]}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const humaniseFirst = (words: string) => `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
