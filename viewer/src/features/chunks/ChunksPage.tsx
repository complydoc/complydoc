import { useState } from "react";
import { NotInRun } from "@/components/NotInRun";
import { Section, SectionStack } from "@/components/Section";
import { Stat, StatGrid } from "@/components/Stat";
import { ToneBadge } from "@/components/ToneBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card } from "@/components/ui/card";
import {
  FACT_TONE,
  FLAGS,
  RETRIEVAL_TONE,
  flaggedChunks,
  meanReciprocalRank,
  retrievalHitRate,
} from "@/report/chunks";
import { formatCount, formatPercent, humanise, plural } from "@/report/format";
import { measured } from "@/report/measured";
import type { ChunkRun, Report } from "@/report/types";
import { ChunkTable } from "./ChunkTable";
import { SplitterTable } from "./SplitterTable";

function indexes(values: number[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

/** One splitter's chunks: sizes, flags, facts, questions, repeated identifiers, and every chunk. */
function SplitterDetail({ run }: { run: ChunkRun }) {
  const repeated = Object.entries(run.repeated_identifiers).sort(
    (a, b) => b[1] - a[1],
  );
  const hitRate = retrievalHitRate(run);
  const mrr = meanReciprocalRank(run);

  return (
    <>
      <StatGrid>
        <Stat
          label="Chunks"
          value={formatCount(run.stats.count)}
          note={`${formatCount(run.stats.tokens_total)} tokens in total`}
        />
        <Stat
          label="Tokens per chunk"
          value={`${run.stats.tokens_median} median`}
          note={`minimum ${run.stats.tokens_min}, 95th percentile ${run.stats.tokens_p95}, maximum ${run.stats.tokens_max}`}
        />
        <Stat
          label="Flagged chunks"
          value={formatCount(flaggedChunks(run))}
          note={`${plural(repeated.length, "identifier")} in more than one chunk`}
        />
      </StatGrid>

      <Section title="Flags">
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flag</TableHead>
                <TableHead>Set when a chunk</TableHead>
                <TableHead className="text-right">Chunks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FLAGS.map(({ key, meaning }) => (
                <TableRow key={key}>
                  <TableCell className="font-mono text-xs">{key}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {meaning}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {run.flag_counts[key] ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      {run.facts.length > 0 && (
        <Section
          title="Expected facts"
          aside="Whole: one chunk holds it. Split: a chunk boundary cuts it."
        >
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Chunks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.facts.map((fact) => (
                  <TableRow key={fact.fact}>
                    <TableCell className="whitespace-normal">
                      {fact.fact}
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={FACT_TONE[fact.status] ?? "neutral"}>
                        {fact.status}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {indexes(fact.chunks)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Section>
      )}

      {run.retrieval.length > 0 && hitRate !== null && mrr !== null && (
        <Section
          title="Retrieval"
          aside={`${formatPercent(hitRate)} retrieved in the top ${run.top_k} by BM25, mean reciprocal rank ${mrr.toFixed(2)}`}
        >
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rank</TableHead>
                  <TableHead>Chunks holding the fact</TableHead>
                  <TableHead>Top chunks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.retrieval.map((result) => (
                  <TableRow key={result.question}>
                    <TableCell className="whitespace-normal">
                      {result.question}
                      <span className="block text-xs text-muted-foreground">
                        {result.fact}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ToneBadge
                        tone={RETRIEVAL_TONE[result.status] ?? "neutral"}
                      >
                        {humanise(result.status)}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {result.rank ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {indexes(result.answer_chunks)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {indexes(result.top_chunks)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Section>
      )}

      {repeated.length > 0 && (
        <Section title="Identifiers in more than one chunk">
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identifier</TableHead>
                  <TableHead className="text-right">Chunks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repeated.map(([value, chunks]) => (
                  <TableRow key={value}>
                    <TableCell className="font-mono text-xs">{value}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {chunks}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Section>
      )}

      <Section title="Every chunk">
        <ChunkTable chunks={run.chunks} />
      </Section>
    </>
  );
}

/** How each text splitter the run tried cut the folder's text. */
export function ChunksPage({ report }: { report: Report }) {
  const runs = report.chunks ?? [];
  const [chosen, setChosen] = useState(runs[0]?.chunker ?? "");
  if (!measured(report, "chunks"))
    return <NotInRun report={report} content="chunks" />;
  const run = runs.find((r) => r.chunker === chosen) ?? runs[0];
  if (!run) return null;

  return (
    <SectionStack>
      <p className="text-sm text-muted-foreground">
        Identifiers and previews are masked. Token counts use{" "}
        {run.token_encoding} ({run.token_fidelity}).
      </p>
      {runs.length > 1 && (
        <Section title="Splitters">
          <SplitterTable runs={runs} />
        </Section>
      )}
      <Section
        title="Splitter"
        aside={
          runs.length > 1 ? (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={run.chunker}
              onValueChange={(value) => value && setChosen(value)}
              aria-label="Splitter"
            >
              {runs.map((r) => (
                <ToggleGroupItem
                  key={r.chunker}
                  value={r.chunker}
                  className="font-mono text-xs"
                >
                  {r.chunker}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <span className="font-mono text-xs">{run.chunker}</span>
          )
        }
      >
        <SplitterDetail run={run} />
      </Section>
    </SectionStack>
  );
}
