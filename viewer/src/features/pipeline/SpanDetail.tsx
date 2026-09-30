import { ArrowDownIcon, FileTextIcon, TriangleAlertIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { SeverityIcon } from "@/components/LevelIcons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChunkRun } from "@/report/chunkTypes";
import { fileName } from "@/report/format";
import { documentHref } from "@/report/route";
import type { Span } from "@/report/traceTree";
import type { TraceStage } from "@/report/traceTypes";
import type { Change } from "@/report/traceView";
import { inputLines, outputLines } from "@/report/traceYaml";
import { ChunkSpread } from "./ChunkSpread";
import { KIND } from "./kinds";
import { Details, Facts } from "./SpanFigures";

type Tab = "run" | "identifiers" | "settings" | "metadata";

function Settings({ stage }: { stage: TraceStage }) {
  const lines = [
    `# ${stage.module}.${stage.component}.${stage.method}`,
    ...Object.entries(stage.parameters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`),
  ];
  return <CodeBlock title="Settings" lines={lines} footer="Read from the component's attributes; secrets left out" />;
}

function Identifiers({ stage }: { stage: TraceStage }) {
  if (stage.identifiers.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        {stage.scanned === "off" ? "This call was not scanned." : "None in what this call passed on."}
      </p>
    );
  return (
    <ul aria-label="Identifiers" className="flex flex-col divide-y rounded-lg border">
      {stage.identifiers.map((identifier) => (
        <li key={identifier.fingerprint} className="flex items-center gap-2.5 px-3 py-2 text-sm">
          <SeverityIcon severity={identifier.severity} className="shrink-0" />
          <span className="font-medium">{identifier.label}</span>
          <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">{identifier.masked}</code>
          {identifier.occurrences > 1 && (
            <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
              ×{identifier.occurrences}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Documents a warning names before the rest are counted. */
const NAMED = 3;

function Warnings({ stage }: { stage: TraceStage }) {
  const warnings = stage.warnings ?? [];
  if (warnings.length === 0) return null;
  return (
    <ul
      aria-label="Warnings"
      className="flex flex-col gap-1.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2"
    >
      {warnings.map((w, i) => (
        <li key={`${w.code}-${i}`} className="flex items-start gap-2 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span className="min-w-0">
            {w.message}
            {w.sources.length > 0 && (
              <span className="block truncate text-xs text-muted-foreground">
                {w.sources.slice(0, NAMED).map(fileName).join(", ")}
                {w.sources.length > NAMED && ` and ${w.sources.length - NAMED} more`}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The call picked: what it is and where it comes from, its figures, then what it was given
 * and what it passed on, the identifiers in that, how it was set, and everything else
 * measured about it.
 */
export function SpanDetail({
  span,
  from,
  change,
  onNext,
  document = null,
  chunks = null,
}: {
  span: Span;
  /** For a split, the chunks it made, as the report inspected them. */
  chunks?: ChunkRun | null;
  /** The report's document this call read, where it read one, to open it. */
  document?: number | null;
  /** The step before, whose output this step was given, where it follows one. */
  from: string | null;
  change: Change | null;
  onNext: (() => void) | null;
}) {
  const { stage } = span;
  const kind = KIND[stage.kind];
  const [tab, setTab] = useState<Tab>("run");
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "run", label: "Run" },
    { id: "identifiers", label: "Identifiers", count: stage.identifiers.length },
    { id: "settings", label: "Settings" },
    { id: "metadata", label: "Metadata" },
  ];
  const panels: Record<Tab, ReactNode> = {
    run: (
      <div className="flex flex-col gap-4">
        {stage.traceback && (
          <CodeBlock
            title="Traceback"
            lines={stage.traceback.split("\n")}
            footer="Paths shortened, identifiers masked"
            collapsible
          />
        )}
        {chunks && <ChunkSpread run={chunks} />}
        <CodeBlock title="Input" lines={inputLines(stage, from)} footer="YAML" collapsible />
        <CodeBlock
          title="Output"
          tone="output"
          collapsible
          lines={outputLines(stage)}
          footer="YAML"
          actions={
            onNext && (
              <Button variant="outline" size="xs" onClick={onNext}>
                <ArrowDownIcon />
                Next call
              </Button>
            )
          }
        />
      </div>
    ),
    identifiers: <Identifiers stage={stage} />,
    settings: <Settings stage={stage} />,
    metadata: <Details stage={stage} change={change} />,
  };

  return (
    <section
      aria-label={`${stage.component}, call ${stage.index + 1}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="flex flex-col gap-4 px-5 pt-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <kind.icon className={cn("size-3.5 shrink-0", kind.tone)} />
              <span className="shrink-0">{kind.label}</span>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate font-mono">{stage.module}</span>
            </span>
            <h2 className="min-w-0 truncate font-heading text-lg font-semibold tracking-tight">{stage.component}</h2>
            {span.label && <span className="min-w-0 truncate text-sm text-muted-foreground">{span.label}</span>}
          </div>
          {document !== null && (
            <Button variant="outline" size="sm" className="ml-auto shrink-0" asChild>
              <a href={documentHref(document)}>
                <FileTextIcon />
                Open the document
              </a>
            </Button>
          )}
        </div>
        <Warnings stage={stage} />
        <Facts stage={stage} />
        <div role="tablist" aria-label="About this call" className="flex gap-5 border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 border-transparent pb-2 text-sm text-muted-foreground hover:text-foreground",
                tab === t.id && "border-foreground text-foreground",
              )}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </header>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {panels[tab]}
      </div>
    </section>
  );
}
