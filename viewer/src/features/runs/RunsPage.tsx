import { createColumnHelper } from "@tanstack/react-table";
import { useContext, useState } from "react";
import { DataTable, type Columns } from "@/components/DataTable";
import { Section, SectionStack } from "@/components/Section";
import { Sparkline } from "@/components/Sparkline";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RunChanges } from "@/features/home/RunChanges";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { runKind, runLabel, runTraits, type Loaded } from "@/report/collections";
import { formatCount, formatPageUsd, formatScore, formatSeconds } from "@/report/format";
import { measured } from "@/report/measured";
import { reportTotals } from "@/report/plan";
import { planFor } from "@/report/planChoice";

interface RunRow {
  id: string;
  run: Loaded;
  kind: string;
  started: string;
  documents: number;
  identifiers: number | null;
  high: number | null;
  hidden: number | null;
  readiness: number | null;
  usd: number | null;
  seconds: number | null;
  current: boolean;
  traits: string[];
}

function rowsOf(runs: Loaded[], current: string | null): RunRow[] {
  return runs.map((run) => {
    const { report } = run;
    const scanned = measured(report, "sensitive");
    const totals = reportTotals(report, planFor(report));
    return {
      id: run.id,
      run,
      kind: runKind(report),
      started: report.run.started_at,
      documents: report.documents.length,
      identifiers: scanned ? report.aggregate.sensitive_total : null,
      high: scanned ? (report.aggregate.sensitive_by_severity.high ?? 0) : null,
      hidden: scanned ? report.aggregate.content_findings_total : null,
      readiness: measured(report, "readiness") ? report.overall.score : null,
      usd: measured(report, "cost") ? totals.usd : null,
      seconds: totals.seconds,
      current: run.id === current,
      traits: runTraits(report),
    };
  });
}

const column = createColumnHelper<RunRow>();
const numeric = { meta: { numeric: true }, sortUndefined: "last" } as const;
const dash = <span className="text-muted-foreground">–</span>;

function columnsFor(chosen: string[], toggle: (id: string) => void): Columns<RunRow> {
  return [
    column.display({
      id: "compare",
      header: () => <span className="sr-only">Compare</span>,
      cell: ({ row }) => (
        <Checkbox
          checked={chosen.includes(row.original.id)}
          onCheckedChange={() => toggle(row.original.id)}
          aria-label={`Compare the ${row.original.kind.toLowerCase()} run of ${runLabel(row.original.run.report)}`}
          disabled={!chosen.includes(row.original.id) && chosen.length >= 2}
        />
      ),
      meta: { narrow: true },
    }),
    column.accessor("started", {
      header: "Run",
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">
            {row.original.kind}
            {row.original.current && <span className="ml-2 text-xs font-normal text-muted-foreground">on screen</span>}
          </span>
          <span className="text-xs text-muted-foreground">{runLabel(row.original.run.report)}</span>
          {row.original.traits.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {row.original.traits.map((trait) => (
                <Badge key={trait} variant={trait === "values revealed" ? "destructive" : "secondary"}>
                  {trait}
                </Badge>
              ))}
            </span>
          )}
        </span>
      ),
    }),
    column.accessor("documents", { header: "Documents", cell: (c) => formatCount(c.getValue()), ...numeric }),
    column.accessor((row) => row.identifiers ?? undefined, {
      id: "identifiers",
      header: "Identifiers",
      cell: ({ row }) =>
        row.original.identifiers === null ? (
          dash
        ) : (
          <span className="flex flex-col items-end">
            <span>{formatCount(row.original.identifiers)}</span>
            <span className="text-xs text-muted-foreground">{formatCount(row.original.high ?? 0)} high</span>
          </span>
        ),
      ...numeric,
    }),
    column.accessor((row) => row.hidden ?? undefined, {
      id: "hidden",
      header: "Hidden",
      cell: (c) => (c.getValue() === undefined ? dash : formatCount(c.getValue() ?? 0)),
      ...numeric,
    }),
    column.accessor((row) => row.readiness ?? undefined, {
      id: "readiness",
      header: "Readiness",
      cell: (c) => (c.getValue() === undefined ? dash : formatScore(c.getValue() ?? null)),
      ...numeric,
    }),
    column.accessor((row) => row.usd ?? undefined, {
      id: "cost",
      header: "Cost · time",
      cell: ({ row }) =>
        row.original.usd === null ? (
          dash
        ) : (
          <span className="flex flex-col items-end">
            <span>{formatPageUsd(row.original.usd)}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.seconds === null ? "not timed" : formatSeconds(row.original.seconds)}
            </span>
          </span>
        ),
      ...numeric,
    }),
  ];
}

/** A figure across the folder's audits, oldest first, where each measured it. */
function trend(rows: RunRow[], pick: (row: RunRow) => number | null): number[] {
  return rows
    .filter((row) => row.kind === "Audit")
    .map(pick)
    .filter((value): value is number => value !== null)
    .reverse();
}

/**
 * Every run of the folder on screen, newest first, with the figures each measured, as an
 * experiment's runs table has them. A click opens a run; ticking two compares them.
 */
export function RunsPage() {
  const { runs, current, open } = useContext(FolderRunsContext);
  const [chosen, setChosen] = useState<string[]>([]);
  const rows = rowsOf(runs, current);
  const toggle = (id: string) =>
    setChosen((now) => (now.includes(id) ? now.filter((c) => c !== id) : [...now, id].slice(-2)));
  // Newer against older, whichever order they were ticked in: runs are listed newest first.
  const pair = runs.filter((run) => chosen.includes(run.id));
  const [newer, older] = pair;
  const identifiers = trend(rows, (row) => row.identifiers);
  const readiness = trend(rows, (row) => row.readiness);

  return (
    <SectionStack>
      <Section
        title="Runs of this folder"
        aside={
          (identifiers.length > 1 || readiness.length > 1) && (
            <span className="flex items-center gap-4">
              {identifiers.length > 1 && (
                <span className="flex items-center gap-1.5">
                  Identifiers <Sparkline values={identifiers} label="Identifiers found by each audit" />
                </span>
              )}
              {readiness.length > 1 && (
                <span className="flex items-center gap-1.5">
                  Readiness <Sparkline values={readiness} label="Readiness of each audit" />
                </span>
              )}
            </span>
          )
        }
      >
        <DataTable
          caption="Runs"
          columns={columnsFor(chosen, toggle)}
          rows={rows}
          rowKey={(row) => row.id}
          sortable
          onRowClick={(row) => {
            // Opening a run shows its Home, where what it found starts.
            if (row.id !== current) open(row.id);
            window.location.assign("#home");
          }}
        />
        <p className="text-xs text-muted-foreground">
          {chosen.length < 2 ? "Tick two runs to compare them." : "Comparing the two runs ticked."}
        </p>
      </Section>

      {newer && older && (
        <Section title="Compared">
          <RunChanges report={newer.report} previous={older.report} />
        </Section>
      )}
    </SectionStack>
  );
}
