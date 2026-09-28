import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatCount, formatPercent, formatSeconds, formatUsd, plural } from "@/report/format";
import type { TraceStage } from "@/report/traceTypes";
import type { Change } from "@/report/traceView";

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words tabular-nums">{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <p className="pb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</p>
      <dl className="flex flex-col">{children}</dl>
    </div>
  );
}

const units = (stage: TraceStage): [string, string] =>
  stage.kind === "embed"
    ? ["text", "vector"]
    : stage.kind === "split"
      ? ["document", "chunk"]
      : ["document", "document"];

function cost(stage: TraceStage): ReactNode {
  if (stage.usd_basis === "local") return <span className="text-muted-foreground">ran here</span>;
  if (stage.usd_basis === "unpriced") return <span className="text-muted-foreground">model not priced</span>;
  return typeof stage.usd === "number" ? formatUsd(stage.usd) : null;
}

/**
 * The call's figures, a line each: when it ran and for how long, what it took in and passed
 * on, what it cost, and what changed against the step before.
 */
export function SpanFigures({ stage, change }: { stage: TraceStage; change: Change | null }) {
  const [inUnit, outUnit] = units(stage);
  const out = stage.kind === "embed" ? stage.vectors : stage.documents_out;
  const spent = cost(stage);
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
    <div role="group" aria-label="Figures" className="grid gap-x-10 gap-y-5 md:grid-cols-2">
      <Group title="Time">
        <Property label="Started">+{formatSeconds(stage.started ?? 0)}</Property>
        <Property label="Took">{formatSeconds(stage.seconds)}</Property>
        {!stage.finished && <Property label="Read">not to the end</Property>}
      </Group>
      <Group title="Information">
        {stage.documents_in !== null && <Property label="In">{plural(stage.documents_in, inUnit)}</Property>}
        {out !== null && <Property label="Out">{plural(out, outUnit)}</Property>}
        {stage.dimensions !== null && <Property label="Dimensions">{formatCount(stage.dimensions)}</Property>}
        {typeof stage.tokens_in === "number" && <Property label="Tokens in">{formatCount(stage.tokens_in)}</Property>}
        {typeof stage.tokens_out === "number" && (
          <Property label="Tokens out">{formatCount(stage.tokens_out)}</Property>
        )}
        {spent !== null && <Property label="Cost">{spent}</Property>}
      </Group>
      <Group title="Found">
        <Property label="Scanned">
          {stage.scanned === "full" ? "patterns and names" : stage.scanned === "patterns" ? "patterns" : "not scanned"}
        </Property>
        {stage.scanned !== "off" && <Property label="Identifiers">{formatCount(stage.identifiers.length)}</Property>}
        {(stage.hidden ?? 0) > 0 && <Property label="Hidden passages">{formatCount(stage.hidden ?? 0)}</Property>}
        {stage.path_keys.length > 0 && (
          <Property label="Paths in">
            <span className="text-destructive">{stage.path_keys.join(", ")}</span>
          </Property>
        )}
        {stage.hosts.length > 0 && <Property label="Sent to">{stage.hosts.join(", ")}</Property>}
        {stage.error && (
          <Property label="Raised">
            <span className="text-destructive">{stage.error}</span>
          </Property>
        )}
      </Group>
      {notes.length > 0 && (
        <Group title="Against the step before">
          {notes.map((note) => (
            <p
              key={note.text}
              className={cn(
                "py-1 text-sm",
                note.good === true && "text-success",
                note.good === false && "text-destructive",
                note.good === null && "text-muted-foreground",
              )}
            >
              {note.text}
            </p>
          ))}
        </Group>
      )}
    </div>
  );
}
