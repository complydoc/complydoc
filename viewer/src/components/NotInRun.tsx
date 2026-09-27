import {
  CheckIcon,
  CoinsIcon,
  CopyIcon,
  FileStackIcon,
  FileTextIcon,
  GaugeIcon,
  ScissorsIcon,
  ShieldAlertIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useRunWith } from "@/hooks/useFolderRuns";
import { runKind, runLabel } from "@/report/collections";
import { commandFor, type Content } from "@/report/measured";
import type { Report } from "@/report/types";

interface Copy {
  icon: LucideIcon;
  title: string;
  /** What the page or section shows when the run has it. */
  shows: string;
  /** Said under the command, where the command alone is not enough to run it. */
  note?: string;
}

const COPY: Record<Content, Copy> = {
  sensitive: {
    icon: ShieldAlertIcon,
    title: "No identifier scan in this run",
    shows:
      "This page lists the personal and financial identifiers in each document, and passages written for a model rather than a reader.",
  },
  cost: {
    icon: CoinsIcon,
    title: "No pricing in this run",
    shows:
      "This page shows what reading these documents costs on each model, from the text layer and as page images, and how long it takes.",
  },
  readiness: {
    icon: GaugeIcon,
    title: "Readiness was not measured in this run",
    shows: "Readiness scores how much of each document's text can be got off the page.",
  },
  loaders: {
    icon: FileStackIcon,
    title: "No loader comparison in this run",
    shows:
      "This page puts document loaders side by side on the same files: the text each returns, the identifiers and facts it keeps, its load time, and which to use for each file type.",
    note: "loaders.yaml names the loaders and the documents. See Comparing loaders in the docs.",
  },
  trace: {
    icon: WorkflowIcon,
    title: "No pipeline in this run",
    shows:
      "This page follows an ingestion pipeline stage by stage: what each loader, splitter and embedding model was given and passed on, its settings, the identifiers in its output, and the hosts it sent text to.",
    note: "Wrap your ingestion code in the block, in Python, with complydoc imported as cd. The run is written to .complydoc when the block ends.",
  },
  chunks: {
    icon: ScissorsIcon,
    title: "No chunks in this run",
    shows:
      "This page shows how a text splitter cut the documents: chunk sizes, chunks cut mid-sentence or mid-table, identifiers repeated across chunks, and whether each expected fact stayed in one chunk.",
  },
  documents: {
    icon: FileTextIcon,
    title: "No documents in this run",
    shows:
      "A chunks run splits the folder's text without keeping a report per document. An audit reads each document: its pages, text, identifiers and cost.",
  },
};

/** A command, in a box, with a button that copies it. */
function Command({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard in this context; the command is still there to select.
    }
  };
  return (
    <div className="flex w-full min-w-0 items-center gap-1 rounded-lg border bg-muted/40 py-1 pr-1 pl-3 text-left">
      <code className="min-w-0 flex-1 font-mono text-xs break-all">
        {command}
      </code>
      <Button variant="ghost" size="icon-sm" onClick={() => void copy()} aria-label={copied ? "Copied" : "Copy the command"}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}

interface NotInRunProps {
  report: Report;
  content: Content;
  /** A whole page, or one card or section of one. */
  size?: "page" | "section";
}

/**
 * What a page or section shows when this run did not produce it: the fact, what
 * the page is for, and the command that fills it for the same folder.
 */
export function NotInRun({ report, content, size = "page" }: NotInRunProps) {
  const { icon: Icon, title, shows, note } = COPY[content];
  const command = commandFor(report, content);
  // Another run of this folder may already hold it; opening that beats running a command.
  const other = useRunWith(content);
  const openOther = other && (
    <Button variant={size === "page" ? "default" : "outline"} size="sm" onClick={other.open} className="self-start">
      Open the {runKind(other.run.report).toLowerCase()} run of {runLabel(other.run.report)}
    </Button>
  );

  if (size === "section") {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium">{title}</p>
        {openOther ?? <Command command={command} />}
      </div>
    );
  }

  return (
    <Empty className="border py-16">
      <EmptyHeader className="max-w-md">
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription>{shows}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-md">
        {openOther && (
          <>
            {openOther}
            <p className="text-xs text-muted-foreground">Or run it again:</p>
          </>
        )}
        <Command command={command} />
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </EmptyContent>
    </Empty>
  );
}
