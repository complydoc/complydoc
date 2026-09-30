import type { ReactNode } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { cn } from "@/lib/utils";
import { formatCount, formatPercent, formatSeconds, formatUsd, plural } from "@/report/format";
import type { TraceStage } from "@/report/traceTypes";
import type { Change } from "@/report/traceView";

const units = (stage: TraceStage): [string, string] =>
  stage.kind === "embed"
    ? ["text", "vector"]
    : stage.kind === "split"
      ? ["document", "chunk"]
      : ["document", "document"];

function cost(stage: TraceStage): ReactNode {
  if (stage.usd_basis === "local") return <span className="text-muted-foreground">ran here</span>;
  if (stage.usd_basis === "unpriced") return <span className="text-muted-foreground">not priced</span>;
  return typeof stage.usd === "number" ? formatUsd(stage.usd) : null;
}

function Fact({ label, children, tone }: { label: string; children: ReactNode; tone?: string | undefined }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("truncate text-sm tabular-nums", tone)}>{children}</dd>
    </div>
  );
}

/**
 * What an engineer asks of a call first, each a label and a value: how long it took and
 * when, what it took in and passed on, its tokens and cost, and what it let through.
 */
export function Facts({ stage }: { stage: TraceStage }) {
  const [inUnit, outUnit] = units(stage);
  const out = stage.kind === "embed" ? stage.vectors : stage.documents_out;
  const spent = cost(stage);
  const high = stage.identifiers.some((i) => i.severity === "high");
  return (
    <dl
      role="group"
      aria-label="Figures"
      className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-6 gap-y-3"
    >
      <Fact label="Took">{formatSeconds(stage.seconds)}</Fact>
      <Fact label="Started">+{formatSeconds(stage.started ?? 0)}</Fact>
      {stage.documents_in !== null && <Fact label="In">{plural(stage.documents_in, inUnit)}</Fact>}
      {out !== null && <Fact label="Out">{plural(out, outUnit)}</Fact>}
      {typeof stage.tokens_in === "number" && <Fact label="Tokens in">{formatCount(stage.tokens_in)}</Fact>}
      {stage.kind !== "embed" && typeof stage.tokens_out === "number" && (
        <Fact label="Tokens out">{formatCount(stage.tokens_out)}</Fact>
      )}
      {spent !== null && <Fact label="Cost">{spent}</Fact>}
      {stage.scanned !== "off" && (
        <Fact
          label="Identifiers"
          tone={stage.identifiers.length > 0 ? (high ? "text-destructive" : "text-warning") : undefined}
        >
          {formatCount(stage.identifiers.length)}
        </Fact>
      )}
      {stage.hosts.length > 0 && <Fact label="Sent to">{stage.hosts.join(", ")}</Fact>}
      {stage.error && (
        <Fact label="Raised" tone="text-destructive">
          {stage.error}
        </Fact>
      )}
    </dl>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * Everything else measured about a call: how it was scanned, what its documents carried,
 * what changed against the step before, and the connections it made.
 */
export function Details({ stage, change }: { stage: TraceStage; change: Change | null }) {
  const notes = change
    ? [
        change.left.length > 0 && { text: `${plural(change.left.length, "identifier")} removed`, good: true },
        change.entered.length > 0 && { text: `${plural(change.entered.length, "identifier")} added`, good: false },
        change.pathKeysRemoved.length > 0 && { text: "file paths removed", good: true },
        change.pathKeysAdded.length > 0 && { text: "file paths added", good: false },
        change.text !== null &&
          Math.abs(change.text) >= 0.01 && {
            text: `text ${change.text > 0 ? "grew" : "cut"} by ${formatPercent(Math.abs(change.text))}`,
            good: null,
          },
      ].filter((note): note is { text: string; good: boolean | null } => Boolean(note))
    : [];
  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-col">
        <Property label="Scanned">
          {stage.scanned === "full" ? "patterns and names" : stage.scanned === "patterns" ? "patterns" : "not scanned"}
        </Property>
        {(stage.hidden ?? 0) > 0 && <Property label="Hidden passages">{formatCount(stage.hidden ?? 0)}</Property>}
        {stage.dimensions !== null && <Property label="Dimensions">{formatCount(stage.dimensions)}</Property>}
        {!stage.finished && <Property label="Read">not to the end</Property>}
        {stage.metadata_keys.length > 0 && <Property label="Metadata keys">{stage.metadata_keys.join(", ")}</Property>}
        {stage.path_keys.length > 0 && (
          <Property label="File paths in">
            <span className="text-destructive">{stage.path_keys.join(", ")}</span>
          </Property>
        )}
        {notes.map((note) => (
          <Property key={note.text} label="Against the step before">
            <span
              className={cn(
                note.good === true && "text-success",
                note.good === false && "text-destructive",
                note.good === null && "text-muted-foreground",
              )}
            >
              {note.text}
            </span>
          </Property>
        ))}
      </dl>
      {stage.connections.length > 0 && <CodeBlock title="Network" lines={stage.connections} />}
    </div>
  );
}
