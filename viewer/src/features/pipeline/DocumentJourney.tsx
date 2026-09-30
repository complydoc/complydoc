import { FileTextIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { SeverityIcon } from "@/components/LevelIcons";
import { Button } from "@/components/ui/button";
import { useHashParam } from "@/hooks/useHashRoute";
import { cn } from "@/lib/utils";
import { sameDocument } from "@/report/chunkPlaces";
import { fileName, formatCount, plural } from "@/report/format";
import { documentHref } from "@/report/route";
import { identifiersOf, journeys, type Journey } from "@/report/traceDocuments";
import type { Trace, TraceStage } from "@/report/traceTypes";
import type { Report } from "@/report/types";
import { KIND } from "./kinds";

/** Documents listed before the rest wait behind a search. */
const LISTED = 200;

const unit: Partial<Record<string, string>> = { load: "page", split: "chunk", embed: "text" };

function DocumentRow({ journey, selected, onSelect }: { journey: Journey; selected: boolean; onSelect: () => void }) {
  const folder = journey.source.slice(0, -fileName(journey.source).length).replace(/[\\/]$/, "");
  const sent = journey.sent?.identifiers.length ?? 0;
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "relative flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50",
          selected && "bg-muted hover:bg-muted",
        )}
      >
        {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">{fileName(journey.source)}</span>
          {folder && <span className="truncate text-xs text-muted-foreground">{folder}</span>}
        </span>
        {journey.warnings.length > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-warning" title="Warnings">
            <TriangleAlertIcon className="size-3.5" />
            {journey.warnings.length}
          </span>
        )}
        {journey.sent && sent > 0 && (
          <span className="font-mono text-xs text-destructive tabular-nums" title="Identifiers sent">
            {sent}
          </span>
        )}
      </button>
    </li>
  );
}

/** One document's way through the run, step by step. */
function Way({
  journey,
  trace,
  report,
  onStep,
}: {
  journey: Journey;
  trace: Trace;
  report: Report;
  onStep: (index: number) => void;
}) {
  const named = identifiersOf(trace);
  const document = report.documents.findIndex((d) => sameDocument(journey.source, d.relative_path));
  const last = journey.steps[journey.steps.length - 1];
  // The pipeline's last step, where a document that went all the way ends.
  const end = trace.stages
    .filter((s) => s.parent === null || s.parent === undefined)
    .reduce<
      TraceStage | undefined
    >((latest, s) => (!latest || (s.started ?? 0) >= (latest.started ?? 0) ? s : latest), undefined);
  const dropped =
    end && last && !journey.steps.some((step) => step.stage.index === end.index || step.stage.parent === end.index);
  const held = journey.sent?.identifiers ?? last?.entry.identifiers ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate font-heading text-lg font-semibold tracking-tight">{fileName(journey.source)}</h2>
          <span className="truncate font-mono text-xs text-muted-foreground">{journey.source}</span>
        </div>
        {document >= 0 && (
          <Button variant="outline" size="sm" className="ml-auto shrink-0" asChild>
            <a href={documentHref(document)}>
              <FileTextIcon />
              Open the document
            </a>
          </Button>
        )}
      </header>

      {journey.warnings.length > 0 && (
        <ul aria-label="Warnings" className="flex flex-col gap-1.5">
          {journey.warnings.map((w, i) => (
            <li key={`${w.code}-${i}`} className="flex items-center gap-2 text-sm text-warning">
              <TriangleAlertIcon className="size-4 shrink-0" />
              {w.message}
            </li>
          ))}
        </ul>
      )}

      <table aria-label="Steps" className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-3 text-left font-normal">Step</th>
            <th className="px-3 py-2 text-right font-normal">Items</th>
            <th className="px-3 py-2 text-right font-normal">Characters</th>
            <th className="px-3 py-2 text-right font-normal">Identifiers</th>
            <th className="py-2 pl-3 text-left font-normal">Sent to</th>
          </tr>
        </thead>
        <tbody>
          {journey.steps.map((step) => {
            const kind = KIND[step.stage.kind];
            const noun = unit[step.stage.kind] ?? "document";
            return (
              <tr
                key={step.stage.index}
                onClick={() => onStep(step.stage.index)}
                className="cursor-pointer border-b last:border-b-0 hover:bg-muted/50"
                title="Show this call in the trace"
              >
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <kind.icon className={cn("size-3.5 shrink-0", kind.tone)} aria-label={kind.label} />
                    <span className="truncate">{step.stage.component}</span>
                    {step.warnings.length > 0 && (
                      <TriangleAlertIcon
                        className="size-3.5 shrink-0 text-warning"
                        aria-label={step.warnings.map((w) => w.message).join("; ")}
                      />
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {plural(step.entry.items, noun)}
                  {step.entry.empty > 0 && (
                    <span className="ml-1 text-xs text-warning">({formatCount(step.entry.empty)} empty)</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCount(step.entry.characters)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {step.stage.scanned === "off" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <>
                      {formatCount(step.entry.identifiers.length)}
                      {step.entered.length > 0 && (
                        <span className="ml-1.5 text-xs text-destructive">+{step.entered.length}</span>
                      )}
                      {step.left.length > 0 && <span className="ml-1.5 text-xs text-success">−{step.left.length}</span>}
                    </>
                  )}
                </td>
                <td className="py-2 pl-3 font-mono text-xs">
                  {step.stage.hosts.length ? step.stage.hosts.join(", ") : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {dropped && last && (
        <p className="text-sm text-muted-foreground">
          Nothing of it reached {end.component}: it went no further than {last.stage.component}.
        </p>
      )}

      {held.length > 0 && (
        <section aria-label="Identifiers" className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {journey.sent ? `Identifiers sent to ${journey.sent.hosts.join(", ")}` : "Identifiers at the last step"}
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {held.map((fingerprint) => {
              const identifier = named.get(fingerprint);
              return (
                <li key={fingerprint} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                  {identifier && <SeverityIcon severity={identifier.severity} className="shrink-0" />}
                  <span className="font-medium">{identifier?.label ?? "Identifier"}</span>
                  <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                    {identifier?.masked ?? fingerprint}
                  </code>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Every document of the run, and the one picked followed from the loader that read it to
 * where it was sent: what each step made of it, the identifiers it gained or lost, and what
 * was wrong with it. A step opens in the trace.
 */
export function DocumentJourney({
  trace,
  report,
  onStep,
}: {
  trace: Trace;
  report: Report;
  onStep: (index: number) => void;
}) {
  const [picked, setPicked] = useHashParam("doc");
  const [query, setQuery] = useState("");
  const all = journeys(trace);
  if (all.length === 0)
    return (
      <p className="text-sm text-muted-foreground">This run named no documents: it was recorded before schema 18.</p>
    );
  const matching = query ? all.filter((j) => j.source.toLowerCase().includes(query.toLowerCase())) : all;
  // The document worth a look first: one sent with identifiers, or one with a warning.
  const first = all.find((j) => (j.sent?.identifiers.length ?? 0) > 0) ?? all.find((j) => j.warnings.length) ?? all[0];
  const journey = all.find((j) => j.source === picked) ?? first;
  return (
    <div className="flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-xl border bg-card lg:min-h-0 lg:flex-row">
      <nav
        aria-label="Documents"
        className="flex max-h-72 min-h-0 flex-col border-b lg:max-h-none lg:w-72 lg:border-r lg:border-b-0"
      >
        <label className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
          <SearchIcon className="size-3.5 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${plural(all.length, "document")}`}
            aria-label="Search documents"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {matching.slice(0, LISTED).map((j) => (
            <DocumentRow
              key={j.source}
              journey={j}
              selected={j.source === journey?.source}
              onSelect={() => setPicked(j.source)}
            />
          ))}
          {matching.length > LISTED && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {formatCount(matching.length - LISTED)} more: search to find one
            </li>
          )}
        </ul>
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4">
        {journey && <Way journey={journey} trace={trace} report={report} onStep={onStep} />}
      </div>
    </div>
  );
}
