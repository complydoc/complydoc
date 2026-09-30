import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChunkRun } from "@/report/chunkTypes";
import { fileName, formatCount, plural } from "@/report/format";

/** Bars across the spread of chunk sizes. */
const BINS = 24;

/** Under this many tokens a chunk is flagged tiny, as complydoc inspects chunks. */
const TINY = 20;

/** The chunks shown as the smallest, where the junk a splitter makes is found. */
const SMALLEST = 3;

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums">{formatCount(Math.round(value))}</dd>
    </div>
  );
}

/**
 * How big the chunks a split made are, in tokens: their spread as bars, the tiny ones in
 * the warning colour, what complydoc flagged in them, and the smallest few to look at.
 */
export function ChunkSpread({ run }: { run: ChunkRun }) {
  const { stats, chunks } = run;
  if (chunks.length === 0) return null;
  const top = Math.max(stats.tokens_max, 1);
  const width = Math.max(1, Math.ceil(top / BINS));
  const bins = Array.from({ length: Math.ceil((top + 1) / width) }, () => 0);
  for (const chunk of chunks) {
    const bin = Math.floor(chunk.tokens / width);
    bins[bin] = (bins[bin] ?? 0) + 1;
  }
  const most = Math.max(...bins, 1);
  const flags = Object.entries(run.flag_counts).filter(([, n]) => n > 0);
  const smallest = [...chunks].sort((a, b) => a.tokens - b.tokens).slice(0, SMALLEST);

  return (
    <section aria-label="Chunk sizes" className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {plural(chunks.length, "chunk")}, in tokens
        </h3>
        <Button variant="ghost" size="xs" asChild>
          <a href="#chunks">
            Open in Chunks
            <ArrowRightIcon />
          </a>
        </Button>
      </div>
      <dl className="grid grid-cols-4 gap-3">
        <Figure label="Smallest" value={stats.tokens_min} />
        <Figure label="Median" value={stats.tokens_median} />
        <Figure label="95th percentile" value={stats.tokens_p95} />
        <Figure label="Largest" value={stats.tokens_max} />
      </dl>
      <div>
        <div aria-hidden className="flex h-16 items-end gap-px">
          {bins.map((n, i) => (
            <span
              key={i}
              className={cn("min-h-px flex-1 rounded-t-[2px]", i * width < TINY ? "bg-warning/80" : "bg-amber-500/60")}
              style={{ height: n ? `${Math.max(6, (n / most) * 100)}%` : "1px" }}
              title={`${i * width}–${(i + 1) * width - 1} tokens: ${plural(n, "chunk")}`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
          <span>0</span>
          <span>{formatCount(top)}</span>
        </div>
      </div>
      {flags.length > 0 && (
        <ul aria-label="Flagged" className="flex flex-col gap-1 text-sm">
          {flags.map(([flag, n]) => (
            <li key={flag} className="flex items-baseline gap-2">
              <span className="w-10 shrink-0 text-right tabular-nums">{formatCount(n)}</span>
              <span className="text-muted-foreground">{run.flag_meanings?.[flag] ?? flag.replaceAll("_", " ")}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1.5">
        <h4 className="text-xs text-muted-foreground">Smallest</h4>
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {smallest.map((chunk) => (
            <li key={chunk.index} className="flex items-baseline gap-3 px-3 py-1.5">
              <span
                className={cn("w-12 shrink-0 font-mono text-xs tabular-nums", chunk.tokens < TINY && "text-warning")}
              >
                {chunk.tokens} tok
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{chunk.preview.trim() || "(empty)"}</span>
              {chunk.document && (
                <span className="shrink-0 truncate text-xs text-muted-foreground">
                  {fileName(chunk.document)}
                  {chunk.page !== null ? ` p.${chunk.page}` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
