import {
  ArrowDownIcon,
  CircleDollarSignIcon,
  ClockIcon,
  CoinsIcon,
  FileTextIcon,
  GlobeIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { SeverityIcon } from "@/components/LevelIcons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCount, formatSeconds, formatUsd } from "@/report/format";
import { documentHref } from "@/report/route";
import type { Span } from "@/report/traceTree";
import type { TraceStage } from "@/report/traceTypes";
import type { Change } from "@/report/traceView";
import { inputLines, outputLines } from "@/report/traceYaml";
import { KIND, durationTone } from "./kinds";
import { Pill } from "./pills";
import { SpanFigures } from "./SpanFigures";

type Tab = "run" | "settings" | "metadata";

function Settings({ stage }: { stage: TraceStage }) {
  const lines = [
    `# ${stage.module}.${stage.component}.${stage.method}`,
    ...Object.entries(stage.parameters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`),
  ];
  return <CodeBlock title="Settings" lines={lines} footer="Read from the component's attributes; secrets left out" />;
}

function Metadata({ stage, change }: { stage: TraceStage; change: Change | null }) {
  return (
    <div className="flex flex-col gap-6">
      <SpanFigures stage={stage} change={change} />
      {stage.identifiers.length > 0 && (
        <section aria-label="Identifiers" className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Identifiers</h3>
          <ul className="flex flex-col divide-y rounded-xl border">
            {stage.identifiers.map((identifier) => (
              <li key={identifier.fingerprint} className="flex items-center gap-2 px-3 py-2 text-sm">
                <SeverityIcon severity={identifier.severity} className="shrink-0" />
                <span className="font-medium">{identifier.label}</span>
                <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">{identifier.masked}</code>
                {identifier.occurrences > 1 && (
                  <span className="ml-auto text-xs text-muted-foreground">×{identifier.occurrences}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {stage.connections.length > 0 && <CodeBlock title="Network" lines={stage.connections} />}
    </div>
  );
}

/**
 * The call picked, as a trace shows a run: its name and figures, then what it was given
 * and what it passed on, how it was set, and everything measured about it.
 */
export function SpanDetail({
  span,
  total,
  from,
  change,
  onNext,
  document = null,
}: {
  span: Span;
  /** The report's document this call read, where it read one, to open it. */
  document?: number | null;
  /** The run's length, which the call's time is judged against. */
  total: number;
  /** The step before, whose output this step was given, where it follows one. */
  from: string | null;
  change: Change | null;
  onNext: (() => void) | null;
}) {
  const { stage } = span;
  const kind = KIND[stage.kind];
  const [tab, setTab] = useState<Tab>("run");
  const tabs: { id: Tab; label: string }[] = [
    { id: "run", label: "Run" },
    { id: "settings", label: "Settings" },
    { id: "metadata", label: "Metadata" },
  ];
  const panels: Record<Tab, ReactNode> = {
    run: (
      <div className="flex flex-col gap-4">
        <CodeBlock title="Input" lines={inputLines(stage, from)} footer="YAML" />
        <CodeBlock
          title="Output"
          tone="output"
          lines={outputLines(stage)}
          footer="YAML"
          actions={
            onNext && (
              <Button variant="outline" size="xs" onClick={onNext}>
                <ArrowDownIcon />
                Jump to next
              </Button>
            )
          }
        />
      </div>
    ),
    settings: <Settings stage={stage} />,
    metadata: <Metadata stage={stage} change={change} />,
  };

  return (
    <section
      aria-label={`${stage.component}, call ${stage.index + 1}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="flex flex-col gap-3 px-6 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg ring-1", kind.pill)}>
            <kind.icon className="size-4" />
          </span>
          <h2 className="min-w-0 truncate font-heading text-2xl font-semibold tracking-tight">{stage.component}</h2>
          {span.label && <span className="min-w-0 truncate text-muted-foreground">{span.label}</span>}
          {document !== null && (
            <Button variant="outline" size="sm" className="ml-auto shrink-0" asChild>
              <a href={documentHref(document)}>
                <FileTextIcon />
                Open the document
              </a>
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill icon={<ClockIcon />} className={durationTone(stage.seconds, total)}>
            {formatSeconds(stage.seconds)}
          </Pill>
          {typeof stage.tokens_in === "number" && <Pill icon={<CoinsIcon />}>{formatCount(stage.tokens_in)} in</Pill>}
          {typeof stage.tokens_out === "number" && (
            <Pill icon={<CoinsIcon />}>{formatCount(stage.tokens_out)} out</Pill>
          )}
          {typeof stage.usd === "number" && <Pill icon={<CircleDollarSignIcon />}>{formatUsd(stage.usd)}</Pill>}
          {stage.identifiers.length > 0 && (
            <Pill icon={<ShieldAlertIcon />} className="text-destructive ring-destructive/30">
              {formatCount(stage.identifiers.length)} identifiers
            </Pill>
          )}
          {stage.hosts.length > 0 && <Pill icon={<GlobeIcon />}>{stage.hosts.join(", ")}</Pill>}
          {stage.error && (
            <Pill icon={null} className="text-destructive ring-destructive/30">
              raised {stage.error}
            </Pill>
          )}
        </div>
        <div role="tablist" aria-label="About this call" className="flex gap-5 border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b-2 border-transparent pb-2 text-sm text-muted-foreground hover:text-foreground",
                tab === t.id && "border-foreground font-medium text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {panels[tab]}
      </div>
    </section>
  );
}
