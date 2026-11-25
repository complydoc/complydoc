import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { NotInRun } from "@/components/NotInRun";
import { Section, SectionStack } from "@/components/Section";
import { ToneBadge } from "@/components/ToneBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDocumentLink } from "@/hooks/useFolderRuns";
import { splitterShortName as shortName } from "@/report/chunkView";
import { Comparison, SplitterDetail } from "./SplitterComparison";
import { FACT_TONE, RETRIEVAL_TONE, factCounts, flaggedChunks } from "@/report/chunks";
import { cutsByDocument, leastBad, splitterName } from "@/report/chunkView";
import { fileName, formatCount, formatPercent, humanise, plural } from "@/report/format";
import { measured } from "@/report/measured";
import type { ChunkRun, Report } from "@/report/types";

/** Documents listed by name under "where the cuts fall" before the rest are left to the document view. */
const DOCUMENTS_SHOWN = 8;


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
 * Which text splitter to use for this folder. A splitter cuts each document's text into the
 * chunks a RAG pipeline stores, searches and hands to the model, so a bad cut is a fact
 * that no search finds whole. The page says that first, compares every splitter the run
 * tried in one table, marks the one that cut least badly, and then shows the one picked up
 * close: its sizes, its bad cuts in words, and the documents it cut worst, each opening on
 * its text with the cuts drawn over it.
 */
export function ChunksPage({ report }: { report: Report }) {
  const runs = report.chunks ?? [];
  const best = leastBad(runs);
  const [chosen, setChosen] = useState((best ?? runs[0])?.chunker ?? "");
  if (!measured(report, "chunks")) return <NotInRun report={report} content="chunks" />;
  const run = runs.find((r) => r.chunker === chosen) ?? runs[0];
  if (!run) return null;
  const checks = runs.some((r) => r.facts.length > 0 || r.retrieval.length > 0);

  return (
    <SectionStack>
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Chunks</h1>
        <p className="text-sm text-muted-foreground">
          Before a RAG pipeline stores documents, a text splitter cuts them into chunks. Each chunk is what search finds
          and what the model reads, so a sentence or a table cut in two is an answer nobody gets whole. This run tried{" "}
          {plural(runs.length, "splitter")} on the folder; pick the one that cuts it least badly.
        </p>
      </div>

      <Section title="Splitters compared" aside={`Tokens counted with ${run.token_encoding}`}>
        <Comparison runs={runs} chosen={run.chunker} best={best} onChoose={setChosen} />
        {best && (
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs text-foreground">{shortName(best)}</span> cuts this folder least badly:{" "}
            {formatPercent(best.stats.count ? flaggedChunks(best) / best.stats.count : 0)} of its chunks cut badly
            {best.facts.length > 0 && `, ${formatCount(factCounts(best).whole)} of ${plural(best.facts.length, "fact")} kept whole`}
            . Pick a row to see any splitter below.
          </p>
        )}
      </Section>

      <Section title={shortName(run)} aside={splitterName(run.chunker).kind}>
        <SplitterDetail run={run} />
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            {flaggedChunks(run) > 0 ? "The documents it cut worst" : "The documents it cut"}
          </h3>
          <p className="text-xs text-muted-foreground">Open one to read it with this splitter&apos;s cuts drawn over the text.</p>
          <WhereCutsFall run={run} />
        </div>
      </Section>

      {checks && (
        <Section title="Checks">
          <Checks runs={runs} />
        </Section>
      )}
    </SectionStack>
  );
}
