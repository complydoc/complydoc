import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCount, formatPercent, formatSeconds, plural } from "@/report/format";
import { changeBetween, flowOf, type Step } from "@/report/traceView";
import { KIND } from "./kinds";

function StepCard({ step, selected, onSelect }: { step: Step; selected: boolean; onSelect: () => void }) {
  const { icon: Icon, label } = KIND[step.kind];
  const flow = flowOf(step);
  const high = step.identifiers.filter((i) => i.severity === "high").length;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex h-full w-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40",
        selected && "border-primary/60 ring-2 ring-primary/30",
        step.errors.length > 0 && "border-destructive/60",
      )}
    >
      <span className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {step.index + 1}. {label}
        {step.stages.length > 1 && <span className="ml-auto normal-case">×{step.stages.length}</span>}
      </span>
      <span className="truncate font-medium" title={`${step.module}.${step.component}`}>
        {step.component}
      </span>
      <span className="text-sm tabular-nums">
        {flow.from && <span className="text-muted-foreground">{flow.from} → </span>}
        {flow.to ?? "–"}
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
        {step.scanned === "off" ? (
          <span>not scanned</span>
        ) : step.identifiers.length === 0 ? (
          <span className="text-success">no identifier</span>
        ) : (
          <span className={high > 0 ? "text-destructive" : "text-warning"}>
            {plural(step.identifiers.length, "identifier")}
            {high > 0 && `, ${formatCount(high)} high`}
          </span>
        )}
        <span>{formatSeconds(step.seconds)}</span>
        {step.hosts.length > 0 && <span className="text-foreground">→ {step.hosts.join(", ")}</span>}
        {step.errors.length > 0 && <span className="text-destructive">raised</span>}
      </span>
    </button>
  );
}

/** What a step changed against the one before, as a few words along the arrow between them. */
function Connector({ before, after }: { before: Step; after: Step }) {
  const change = changeBetween(before, after);
  const notes = [
    change.left.length > 0 && { text: `−${plural(change.left.length, "identifier")}`, tone: "text-success" },
    change.entered.length > 0 && { text: `+${plural(change.entered.length, "identifier")}`, tone: "text-destructive" },
    change.pathKeysRemoved.length > 0 && { text: "paths removed", tone: "text-success" },
    change.pathKeysAdded.length > 0 && { text: "paths added", tone: "text-destructive" },
    change.text !== null &&
      Math.abs(change.text) >= 0.01 && {
        text: `text ${change.text > 0 ? "+" : "−"}${formatPercent(Math.abs(change.text))}`,
        tone: "text-muted-foreground",
      },
  ].filter((note): note is { text: string; tone: string } => Boolean(note));
  return (
    <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 px-1 text-center text-xs">
      {notes.map((note) => (
        <span key={note.text} className={note.tone}>
          {note.text}
        </span>
      ))}
      <ArrowRightIcon className="size-4 text-muted-foreground/60" aria-hidden="true" />
    </div>
  );
}

/** The steps left to right, what each did, and what changed between each and the next. */
export function StepFlow({
  steps,
  selected,
  onSelect,
}: {
  steps: Step[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol aria-label="Steps" className="flex items-stretch overflow-x-auto pb-2">
      {steps.flatMap((step, index) => [
        ...(index > 0
          ? [
              <li
                key={`change-${step.index}`}
                className="flex shrink-0"
                aria-label={`From step ${index} to ${index + 1}`}
              >
                <Connector before={steps[index - 1] as Step} after={step} />
              </li>,
            ]
          : []),
        <li key={step.index} className="flex min-w-40 flex-1 basis-0">
          <StepCard step={step} selected={step.index === selected} onSelect={() => onSelect(step.index)} />
        </li>,
      ])}
    </ol>
  );
}
