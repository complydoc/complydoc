import { createColumnHelper } from "@tanstack/react-table";
import { useContext, useState } from "react";
import { DataTable, type Columns } from "@/components/DataTable";
import { Section, SectionStack } from "@/components/Section";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { runKind, runLabel, runTraits, type Loaded } from "@/report/collections";
import { formatCount, plural } from "@/report/format";
import { pipelineShape } from "@/report/traceView";
import type { Report } from "@/report/types";
import { PipelineCompare } from "./PipelineCompare";

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
      <span className="flex flex-wrap items-center gap-1.5 whitespace-normal">
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

/** A box to tick a run for comparing, first in each row of a pipeline's runs. */
function compareColumn(chosen: string[], toggle: (id: string) => void) {
  return column.display({
    id: "compare",
    header: () => <span className="sr-only">Compare</span>,
    cell: ({ row }) => (
      <Checkbox
        checked={chosen.includes(row.original.id)}
        onCheckedChange={() => toggle(row.original.id)}
        onClick={(event) => event.stopPropagation()}
        aria-label={`Compare the run of ${runLabel(row.original.run.report)}`}
        disabled={!chosen.includes(row.original.id) && chosen.length >= 2}
      />
    ),
    meta: { narrow: true },
  });
}

/**
 * Every run of the folder on screen, newest first, and what each holds. A click opens it.
 * A folder's runs are not compared: its documents come and go between runs, so a change in
 * its totals says little about the documents. A pipeline's are, two at a time: they ran on
 * the same documents, so a difference is the pipeline's.
 */
export function RunsPage() {
  const { runs, current, open } = useContext(FolderRunsContext);
  const [chosen, setChosen] = useState<string[]>([]);
  const pipeline = runs.some((run) => run.report.trace && run.report.trace.kind !== "audit");
  const toggle = (id: string) =>
    setChosen((now) => (now.includes(id) ? now.filter((c) => c !== id) : [...now, id].slice(-2)));
  // Newer against older, whichever was ticked first: runs are listed newest first.
  const [newer, older] = runs.filter((run) => chosen.includes(run.id));
  return (
    <SectionStack>
      <Section title={pipeline ? "Runs of this pipeline" : "Runs of this folder"}>
        <DataTable
          caption="Runs"
          columns={pipeline ? [compareColumn(chosen, toggle), ...COLUMNS] : COLUMNS}
          rows={rowsOf(runs, current)}
          rowKey={(row) => row.id}
          sortable
          onRowClick={(row) => {
            // Opening a run shows where what it found starts: a pipeline's steps, or Home.
            if (row.id !== current) open(row.id);
            window.location.assign(
              row.run.report.trace && row.run.report.trace.kind !== "audit" ? "#pipeline" : "#home",
            );
          }}
        />
        {pipeline && (
          <p className="text-xs text-muted-foreground">
            {chosen.length < 2 ? "Tick two runs to compare them." : "Comparing the two runs ticked."}
          </p>
        )}
      </Section>
      {newer && older && (
        <Section title="Compared">
          <PipelineCompare older={older} newer={newer} />
        </Section>
      )}
    </SectionStack>
  );
}
