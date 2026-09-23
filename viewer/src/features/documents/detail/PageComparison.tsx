import { Fragment, useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { plural } from "@/report/format";
import { defaultPair, diffReadings, type Reading } from "@/report/readings";
import type { Highlight } from "@/report/highlight";
import type { PagePreview } from "@/report/types";
import { PagePane } from "./PagePane";
import { ReadingPane } from "./ReadingPane";

interface PageComparisonProps {
  number: number;
  name: string;
  readings: Reading[];
  preview: PagePreview | undefined;
  /** A finding on this page to show in every pane. */
  highlight: Highlight | null;
}

function pick(readings: Reading[], id: string): Reading {
  return readings.find((r) => r.id === id) ?? (readings[0] as Reading);
}

/**
 * The page and two of its readings side by side, with what each reading has
 * that the other lacks marked. Three equal panes of one height, resizable on a
 * wide screen and stacked on a narrow one.
 */
export function PageComparison({ number, name, readings, preview, highlight }: PageComparisonProps) {
  const wide = useMediaQuery("(min-width: 64rem)");
  const [[leftId, rightId], setPair] = useState(() => defaultPair(readings));
  const left = pick(readings, leftId);
  const right = pick(readings, rightId);
  const diff = diffReadings(left.text, right.text);
  const shared =
    left.id === right.id ? "same reading" : diff.differences === 0 ? "identical" : plural(diff.differences, "difference");

  const panes = [
    <PagePane key="page" number={number} name={name} preview={preview} mark={highlight?.box ?? null} />,
    <ReadingPane
      key="left"
      label="Left reading"
      readings={readings}
      selected={left.id}
      onSelect={(id) => setPair([id, rightId])}
      parts={diff.left}
      side="left"
      note={left.kept ? "kept" : shared}
      needle={highlight?.needle ?? null}
    />,
    <ReadingPane
      key="right"
      label="Right reading"
      readings={readings}
      selected={right.id}
      onSelect={(id) => setPair([leftId, id])}
      parts={diff.right}
      side="right"
      note={shared}
      needle={highlight?.needle ?? null}
    />,
  ];

  if (!wide) {
    return <div className="flex flex-col gap-4 [&>[data-slot=card]]:h-[32rem]">{panes}</div>;
  }
  return (
    // The panel library sizes its group to 100% of the parent, so the parent carries the height.
    <div className="h-[calc(100svh-13rem)] min-h-[36rem]">
      <ResizablePanelGroup orientation="horizontal">
        {panes.map((pane, index) => (
          <Fragment key={pane.key}>
            {index > 0 && <ResizableHandle withHandle className="mx-2" />}
            {/* A card's border is a ring drawn just outside it; the padding keeps the panel from clipping it. */}
            <ResizablePanel defaultSize={`${100 / panes.length}%`} minSize="20%" className="p-px">
              {pane}
            </ResizablePanel>
          </Fragment>
        ))}
      </ResizablePanelGroup>
    </div>
  );
}
