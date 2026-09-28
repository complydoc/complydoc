import { createColumnHelper } from "@tanstack/react-table";
import { useContext } from "react";
import { DataTable, type Columns } from "@/components/DataTable";
import { Section } from "@/components/Section";
import { Badge } from "@/components/ui/badge";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { runKind, runLabel, runTraits, type Loaded } from "@/report/collections";
import { formatCount, plural } from "@/report/format";
import { pipelineShape } from "@/report/traceView";
import type { Report } from "@/report/types";

interface RunRow {
  id: string;
  run: Loaded;
  kind: string;
  started: string;
  holds: string;
  documents: number;
  current: boolean;
  traits: string[];
}

/** What a run holds, in a few words: what there is to open in it. */
function holdings(report: Report): string {
  if (report.trace && report.trace.kind !== "audit") return pipelineShape(report.trace);
  if (report.chunks?.length && report.documents.length === 0) return plural(report.chunks.length, "splitter");
  if (report.loader_comparison) return plural(report.loader_comparison.loaders.length, "loader");
  const parts: Record<string, string> = { sensitive: "identifiers", cost: "cost", readiness: "readiness" };
  return (report.run.components_run ?? [])
    .map((part) => parts[part])
    .filter(Boolean)
    .join(", ");
}

function rowsOf(runs: Loaded[], current: string | null): RunRow[] {
  return runs.map((run) => ({
    id: run.id,
    run,
    kind: runKind(run.report),
    started: run.report.run.started_at,
    holds: holdings(run.report),
    documents: run.report.documents.length,
    current: run.id === current,
    traits: runTraits(run.report),
  }));
}

const column = createColumnHelper<RunRow>();

const COLUMNS: Columns<RunRow> = [
  column.accessor("started", {
    header: "Run",
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span className="font-medium">
          {row.original.kind}
          {row.original.current && <span className="ml-2 text-xs font-normal text-muted-foreground">on screen</span>}
        </span>
        <span className="text-xs text-muted-foreground">{runLabel(row.original.run.report)}</span>
      </span>
    ),
  }),
  column.accessor("holds", {
    header: "Holds",
    cell: ({ row }) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">{row.original.holds}</span>
        {row.original.traits.map((trait) => (
          <Badge
            key={trait}
            variant={trait === "values revealed" || trait === "identifiers sent" ? "destructive" : "secondary"}
          >
            {trait}
          </Badge>
        ))}
      </span>
    ),
  }),
  column.accessor("documents", {
    header: "Documents",
    cell: (c) => formatCount(c.getValue()),
    meta: { numeric: true },
  }),
];

/**
 * Every run of the folder on screen, newest first, and what each holds. A click opens it.
 * Runs are not compared with each other: a folder's documents come and go between runs,
 * so a change in its totals says little about the documents themselves.
 */
export function RunsPage() {
  const { runs, current, open } = useContext(FolderRunsContext);
  const pipeline = runs.some((run) => run.report.trace && run.report.trace.kind !== "audit");
  return (
    <Section title={pipeline ? "Runs of this pipeline" : "Runs of this folder"}>
      <DataTable
        caption="Runs"
        columns={COLUMNS}
        rows={rowsOf(runs, current)}
        rowKey={(row) => row.id}
        sortable
        onRowClick={(row) => {
          // Opening a run shows where what it found starts: a pipeline's steps, or Home.
          if (row.id !== current) open(row.id);
          window.location.assign(row.run.report.trace && row.run.report.trace.kind !== "audit" ? "#pipeline" : "#home");
        }}
      />
    </Section>
  );
}
