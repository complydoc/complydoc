import type { ReactNode } from "react";
import { SeverityIcon } from "@/components/LevelIcons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fileName, formatCount, formatSeconds, plural } from "@/report/format";
import { flowOf, type Step } from "@/report/traceView";
import { KIND } from "./kinds";

/** Sources named by file before the rest are counted. */
const SOURCES_SHOWN = 6;

/** Identifiers listed before the rest are left to the table of where each went. */
const IDENTIFIERS_SHOWN = 8;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

function value(setting: unknown): string {
  if (Array.isArray(setting)) return setting.map((item) => JSON.stringify(item)).join(", ");
  return typeof setting === "string" ? setting : JSON.stringify(setting);
}

function Settings({ step }: { step: Step }) {
  const names = [...Object.keys(step.parameters), ...Object.keys(step.varying)].sort();
  if (names.length === 0) return <p className="text-sm text-muted-foreground">It has no settings to read.</p>;
  return (
    <dl className="divide-y">
      {names.map((name) => (
        <Row key={name} label={name}>
          {name in step.varying ? (
            <span className="text-muted-foreground">{formatCount(step.varying[name] ?? 0)} values, one a call</span>
          ) : (
            <code className="font-mono text-xs">{value(step.parameters[name])}</code>
          )}
        </Row>
      ))}
    </dl>
  );
}

function Output({ step }: { step: Step }) {
  const flow = flowOf(step);
  const shown = step.sources.slice(0, SOURCES_SHOWN);
  return (
    <dl className="divide-y">
      {flow.from && <Row label="Given">{flow.from}</Row>}
      <Row label={step.kind === "embed" ? "Made" : "Passed on"}>
        {flow.to ?? "–"}
        {step.dimensions !== null && ` of ${formatCount(step.dimensions)} dimensions`}
      </Row>
      {step.charactersOut !== null && <Row label="Characters">{formatCount(step.charactersOut)}</Row>}
      {shown.length > 0 && (
        <Row label="From">
          {shown.map(fileName).join(", ")}
          {step.sources.length > shown.length && ` and ${formatCount(step.sources.length - shown.length)} more`}
        </Row>
      )}
      {step.metadataKeys.length > 0 && (
        <Row label="Metadata">
          {step.metadataKeys.map((key) => (
            <code
              key={key}
              className={`ml-1 font-mono text-xs ${step.pathKeys.includes(key) ? "text-destructive" : ""}`}
              title={step.pathKeys.includes(key) ? "Holds an absolute file path" : undefined}
            >
              {key}
            </code>
          ))}
        </Row>
      )}
      {step.hidden !== null && step.hidden > 0 && <Row label="Hidden passages">{formatCount(step.hidden)}</Row>}
      <Row label="Time">{formatSeconds(step.seconds)}</Row>
      {!step.finished && <Row label="Read">not to the end before the block closed</Row>}
      {step.errors.map((error) => (
        <Row key={error} label="Raised">
          <span className="text-destructive">{error}</span>
        </Row>
      ))}
    </dl>
  );
}

function Found({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-3">
      {step.hosts.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Sent to {step.hosts.join(", ")}</p>
          <ul className="flex flex-col font-mono text-xs text-muted-foreground">
            {step.connections.map((connection) => (
              <li key={connection}>{connection}</li>
            ))}
          </ul>
        </div>
      )}
      {step.scanned === "off" ? (
        <p className="text-sm text-muted-foreground">Not scanned: the block ran with scan="off".</p>
      ) : step.identifiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No identifier in what it {step.kind === "embed" ? "sent" : "passed on"}.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {step.identifiers.slice(0, IDENTIFIERS_SHOWN).map((identifier) => (
            <li key={identifier.fingerprint} className="flex items-center gap-2 text-sm">
              <SeverityIcon severity={identifier.severity} className="shrink-0" />
              <span className="font-medium">{identifier.label}</span>
              <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">{identifier.masked}</code>
              {identifier.occurrences > 1 && (
                <span className="ml-auto text-xs text-muted-foreground">×{identifier.occurrences}</span>
              )}
            </li>
          ))}
          {step.identifiers.length > IDENTIFIERS_SHOWN && (
            <li className="text-xs text-muted-foreground">
              and {formatCount(step.identifiers.length - IDENTIFIERS_SHOWN)} more, in the table below
            </li>
          )}
        </ul>
      )}
      {step.scanned === "patterns" && (
        <p className="text-xs text-muted-foreground">
          Read by pattern alone here: names and organisations are looked for only at loading and at the last step.
        </p>
      )}
    </div>
  );
}

/** The step picked above: how it was set, what it passed on, and what was in it. */
export function StepDetail({ step }: { step: Step }) {
  const { label } = KIND[step.kind];
  const links = [
    step.kind === "load" && { href: "#documents", text: "Open the documents" },
    step.chunks.length > 0 && { href: "#chunks", text: "Open the chunks" },
  ].filter((link): link is { href: string; text: string } => Boolean(link));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 font-mono text-xs text-muted-foreground">
            {step.module}.{step.component}.{step.method}
            {step.stages.length > 1 && `, ${plural(step.stages.length, "call")}`}
          </p>
          <Settings step={step} />
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{label}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Output step={step} />
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-primary underline-offset-4 hover:underline">
              {link.text}
            </a>
          ))}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{step.kind === "embed" ? "What it sent" : "What was in it"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Found step={step} />
        </CardContent>
      </Card>
    </div>
  );
}
