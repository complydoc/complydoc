import { createColumnHelper } from "@tanstack/react-table";
import { ArrowDownUpIcon, ChevronRightIcon, FileTextIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { DataTable, type Columns } from "@/components/DataTable";
import { ToneBadge } from "@/components/ToneBadge";
import { cn } from "@/lib/utils";
import { formatCount, formatPageUsd, formatPercent, formatScore, formatSeconds } from "@/report/format";
import type { Totals } from "@/report/plan";
import { agreementTone, bandOf, bandTone, severityTone, visionTone } from "@/report/select";
import type { TreeNode } from "@/report/tree";
import type { Thresholds } from "@/report/types";

const column = createColumnHelper<TreeNode>();
const numeric = { meta: { numeric: true }, sortUndefined: "last" } as const;

/** A screen of rows; a folder of hundreds is paged rather than scrolled. */
const ROWS_PER_PAGE = 50;

function Time({ totals }: { totals: Totals }) {
  if (totals.seconds === null) return <span className="text-muted-foreground">not timed</span>;
  const notes = [
    totals.untimed > 0 && `${totals.untimed} of ${totals.pages} pages not timed`,
    totals.averaged && "a loader's time, spread over its pages",
  ].filter(Boolean);
  return (
    <span title={notes.join("; ") || undefined}>
      {totals.averaged && "~"}
      {formatSeconds(totals.seconds)}
      {totals.untimed > 0 && <span className="text-muted-foreground">+</span>}
    </span>
  );
}

/** Which of the columns that only some runs fill have anything in them. */
interface Filled {
  agreement: boolean;
  timed: boolean;
}

function filled(nodes: TreeNode[]): Filled {
  const all: TreeNode[] = [];
  const walk = (node: TreeNode) => {
    all.push(node);
    node.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return {
    agreement: all.some((n) => n.document?.agreement !== undefined && n.document?.agreement !== null),
    timed: all.some((n) => n.totals.seconds !== null),
  };
}

function columnsFor(vision: boolean, thresholds: Thresholds, has: Filled): Columns<TreeNode> {
  const columns: Columns<TreeNode> = [
    column.accessor("name", {
      header: "Name",
      cell: ({ row, getValue }) => {
        const node = row.original;
        const open = row.getIsExpanded();
        const Icon = node.kind === "file" ? FileTextIcon : open ? FolderOpenIcon : FolderIcon;
        return (
          // A long name is cut short, whole on hover, so it does not push the figures off the table.
          <span
            className="flex max-w-[15rem] min-w-0 items-center gap-1.5 xl:max-w-[24rem] 2xl:max-w-none"
            style={{ paddingLeft: `${row.depth * 1.25}rem` }}
          >
            {node.kind === "folder" ? (
              <button
                type="button"
                onClick={row.getToggleExpandedHandler()}
                aria-label={`${open ? "Close" : "Open"} ${getValue()}`}
                aria-expanded={open}
                className="rounded-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} />
              </button>
            ) : (
              <span className="size-4" />
            )}
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            {node.document ? (
              <a
                href={`#documents/${node.document.index}`}
                title={node.document.path}
                className="truncate font-medium underline-offset-4 hover:underline"
              >
                {getValue()}
              </a>
            ) : (
              <span className="truncate font-medium" title={getValue()}>
                {getValue()}
              </span>
            )}
            {node.kind === "folder" && (
              <span className="text-xs text-muted-foreground">{formatCount(node.totals.documents)}</span>
            )}
          </span>
        );
      },
    }),
    column.accessor((node) => node.totals.pages, {
      id: "pages",
      header: "Pages",
      cell: (c) => formatCount(c.getValue()),
      ...numeric,
    }),
    column.accessor((node) => node.score ?? undefined, {
      id: "score",
      header: "Readiness",
      cell: (c) => {
        const score = c.getValue() ?? null;
        return <ToneBadge tone={bandTone(bandOf(thresholds, score))}>{formatScore(score)}</ToneBadge>;
      },
      ...numeric,
    }),
    ...(has.agreement
      ? [
          column.accessor((node) => node.document?.agreement ?? undefined, {
            id: "agreement",
            header: "Agreement",
            cell: ({ row, getValue }) => {
              const value = getValue();
              if (value === undefined) return "–";
              return (
                <ToneBadge tone={agreementTone(thresholds, value)}>
                  {formatPercent(value)}
                  {row.original.document?.reordered && (
                    <span title="A reader held the same words in another order" className="inline-flex">
                      <ArrowDownUpIcon className="size-3" aria-label="reordered" />
                    </span>
                  )}
                </ToneBadge>
              );
            },
            ...numeric,
          }),
        ]
      : []),
    column.accessor("findings", {
      header: "Identifiers",
      cell: ({ row, getValue }) =>
        row.original.highest ? (
          <ToneBadge tone={severityTone(row.original.highest)}>{formatCount(getValue())}</ToneBadge>
        ) : (
          "–"
        ),
      ...numeric,
    }),
  ];
  if (vision) {
    columns.push(
      column.accessor((node) => node.document?.vision?.disagree, {
        id: "vision",
        header: "Vision check",
        cell: ({ row }) => {
          const check = row.original.document?.vision;
          if (!check) return "–";
          return (
            <ToneBadge tone={visionTone(check)}>
              {check.disagree > 0 ? `${check.disagree} of ${check.checked} disagree` : `${check.checked} checked`}
            </ToneBadge>
          );
        },
        ...numeric,
      }),
    );
  }
  columns.push(
    // One column for both, the time beneath the price: two narrow figures side by side
    // pushed the table past the width beside the sidebar.
    column.accessor((node) => node.totals.usd ?? undefined, {
      id: "cost",
      header: has.timed ? "Cost · time" : "Cost",
      cell: ({ row, getValue }) => (
        <span className="flex flex-col items-end tabular-nums">
          <span>{formatPageUsd(getValue() ?? null)}</span>
          {has.timed && (
            <span className="text-xs text-muted-foreground">
              <Time totals={row.original.totals} />
            </span>
          )}
        </span>
      ),
      ...numeric,
    }),
  );
  return columns;
}

/**
 * Every document, in the folders it came from. Each folder adds up what its
 * documents cost and take to read under the plan chosen in the top bar.
 */
export function DocumentTree({
  nodes,
  vision,
  thresholds,
}: {
  nodes: TreeNode[];
  vision: boolean;
  thresholds: Thresholds;
}) {
  return (
    <DataTable
      caption="Documents"
      columns={columnsFor(vision, thresholds, filled(nodes))}
      rows={nodes}
      rowKey={(node) => node.id}
      subRows={(node) => node.children}
      rowHref={(node) => (node.document ? `#documents/${node.document.index}` : undefined)}
      sortable
      search="Search documents"
      pageSize={ROWS_PER_PAGE}
    />
  );
}
