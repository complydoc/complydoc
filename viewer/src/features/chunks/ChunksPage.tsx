import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { NotInRun } from "@/components/NotInRun";
import { Section, SectionStack } from "@/components/Section";
import { ToneBadge } from "@/components/ToneBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDocumentLink } from "@/hooks/useFolderRuns";
import { FACT_TONE, RETRIEVAL_TONE, factCounts, flaggedChunks, retrievalHitRate } from "@/report/chunks";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cutsByDocument, flagSummary, sizeHistogram, splitterLabels, splitterName } from "@/report/chunkView";
import { fileName, formatCount, formatPercent, humanise, plural } from "@/report/format";
import { measured } from "@/report/measured";
import type { ChunkRun, Report } from "@/report/types";

/** Documents listed by name under "where the cuts fall" before the rest are left to the document view. */
const DOCUMENTS_SHOWN = 8;

/** A splitter's settings as a short name, or its whole name where it gave none. */
/** Splitters beyond which the one to show is picked from a list, not a row of buttons. */
const PICKED_BY_BUTTON = 3;

const shortName = (run: ChunkRun) => splitterName(run.chunker).settings.join(" · ") || run.chunker;

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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </li>
  );
}

function SplitterCard({ run }: { run: ChunkRun }) {
  const name = splitterName(run.chunker);
  const flagged = flaggedChunks(run);
  const repeated = Object.keys(run.repeated_identifiers).length;
  const facts = factCounts(run);
  const hitRate = retrievalHitRate(run);
  return (
    <Card role="group" aria-label={run.chunker}>
      <CardHeader>
        <CardTitle className="font-mono text-sm">{shortName(run)}</CardTitle>
        {name.settings.length > 0 && <CardDescription>{name.kind}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatCount(run.stats.count)}</p>
            <p className="text-xs text-muted-foreground">chunks, {formatCount(run.stats.tokens_total)} tokens</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {run.stats.count ? formatPercent(flagged / run.stats.count) : "–"}
            </p>
            <p className="text-xs text-muted-foreground">cut badly, {plural(flagged, "chunk")}</p>
          </div>
        </div>
        <Sizes run={run} />
        <ul className="flex flex-col gap-1 text-sm">
          {flagSummary(run).map((flag) => (
            <Line key={flag.key} label={flag.words} value={formatCount(flag.count)} />
          ))}
          {repeated > 0 && <Line label="identifiers in several chunks" value={formatCount(repeated)} />}
          {run.facts.length > 0 && (
            <Line
              label="expected facts kept whole"
              value={`${formatCount(facts.whole)} of ${formatCount(run.facts.length)}`}
            />
          )}
          {hitRate !== null && (
            <Line label={`questions answered in the top ${run.top_k}`} value={formatPercent(hitRate)} />
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

/** The documents a splitter cut worst, each a way to the document with the cuts drawn over its text. */
function WhereCutsFall({ run }: { run: ChunkRun }) {
  const link = useDocumentLink();
  const documents = cutsByDocument(run).slice(0, DOCUMENTS_SHOWN);
  const query = `chunks=${encodeURIComponent(run.chunker)}`;
  return (
    <ul className="flex flex-col divide-y rounded-xl border" aria-label="Documents, the worst cut first">
      {documents.map((entry) => {
        const go = link(entry.document, query);
        const content = (
          <>
            <span className="min-w-0 flex-1 truncate" title={entry.document}>
              {fileName(entry.document)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatCount(entry.flagged)} of {plural(entry.chunks, "chunk")} cut badly
            </span>
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-warning"
                style={{ width: `${entry.chunks ? (entry.flagged / entry.chunks) * 100 : 0}%` }}
              />
            </span>
          </>
        );
        return (
          <li key={entry.document}>
            {go ? (
              <button
                type="button"
                onClick={go}
                className="group flex w-full items-center gap-4 px-4 py-2.5 text-left text-sm hover:bg-muted/50"
              >
                {content}
                <ArrowRightIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ) : (
              <div className="flex items-center gap-4 px-4 py-2.5 text-sm">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Each expected fact and question against each splitter: what the checks the run was given found. */
function Checks({ runs }: { runs: ChunkRun[] }) {
  const facts = [...new Set(runs.flatMap((run) => run.facts.map((fact) => fact.fact)))];
  const questions = [...new Set(runs.flatMap((run) => run.retrieval.map((result) => result.question)))];
  return (
    <Table aria-label="Checks">
      <TableHeader>
        <TableRow>
          <TableHead>Checked</TableHead>
          {runs.map((run) => (
            <TableHead key={run.chunker} className="font-mono text-xs">
              {shortName(run)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {facts.map((fact) => (
          <TableRow key={`fact:${fact}`}>
            <TableCell className="whitespace-normal">“{fact}”</TableCell>
            {runs.map((run) => {
              const status = run.facts.find((f) => f.fact === fact)?.status;
              return (
                <TableCell key={run.chunker}>
                  {status ? <ToneBadge tone={FACT_TONE[status] ?? "neutral"}>{status}</ToneBadge> : "–"}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
        {questions.map((question) => (
          <TableRow key={`question:${question}`}>
            <TableCell className="whitespace-normal">{question}</TableCell>
            {runs.map((run) => {
              const result = run.retrieval.find((r) => r.question === question);
              return (
                <TableCell key={run.chunker}>
                  {result ? (
                    <ToneBadge tone={RETRIEVAL_TONE[result.status] ?? "neutral"}>
                      {result.rank ? `rank ${result.rank}` : humanise(result.status)}
                    </ToneBadge>
                  ) : (
                    "–"
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * How each text splitter cut the folder's text, side by side: how many chunks, how big,
 * how many cut badly and how. Then, for the splitter picked, the documents it cut worst,
 * each opening on its text with the cuts drawn over it; and the expected facts and
 * questions the run was given, against every splitter.
 */
export function ChunksPage({ report }: { report: Report }) {
  const runs = report.chunks ?? [];
  const [chosen, setChosen] = useState(runs[0]?.chunker ?? "");
  if (!measured(report, "chunks")) return <NotInRun report={report} content="chunks" />;
  const run = runs.find((r) => r.chunker === chosen) ?? runs[0];
  if (!run) return null;
  const checks = runs.some((r) => r.facts.length > 0 || r.retrieval.length > 0);
  const labels = splitterLabels(runs.map((r) => r.chunker));

  return (
    <SectionStack>
      <Section title="Splitters" aside={`Tokens counted with ${run.token_encoding}`}>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {runs.map((r) => (
            <SplitterCard key={r.chunker} run={r} />
          ))}
        </div>
      </Section>

      <Section
        title="Where the cuts fall"
        aside={
          runs.length > PICKED_BY_BUTTON ? (
            <Select value={run.chunker} onValueChange={setChosen}>
              <SelectTrigger size="sm" aria-label="Splitter" className="max-w-full font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {runs.map((r) => (
                    <SelectItem key={r.chunker} value={r.chunker} className="font-mono text-xs">
                      {labels.get(r.chunker)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            runs.length > 1 && (
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={run.chunker}
                onValueChange={(value) => value && setChosen(value)}
                aria-label="Splitter"
              >
                {runs.map((r) => (
                  <ToggleGroupItem key={r.chunker} value={r.chunker} className="font-mono text-xs">
                    {labels.get(r.chunker)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )
          )
        }
      >
        <WhereCutsFall run={run} />
      </Section>

      {checks && (
        <Section title="Checks">
          <Checks runs={runs} />
        </Section>
      )}
    </SectionStack>
  );
}
