import { Fragment, useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { plural } from "@/report/format";
import { defaultPair, diffReadings, type Reading } from "@/report/readings";
import type { PagePreview } from "@/report/types";
import { PagePane } from "./PagePane";
import { ReadingPane } from "./ReadingPane";

interface PageComparisonProps {
  number: number;
  readings: Reading[];
  preview: PagePreview | undefined;
}

function pick(readings: Reading[], id: string): Reading {
  return readings.find((r) => r.id === id) ?? (readings[0] as Reading);
}

/**
 * The page and two of its readings side by side, with what each reading has
 * that the other lacks marked. Three equal panes of one height, resizable on a
 * wide screen and stacked on a narrow one.
 */
export function PageComparison({ number, readings, preview }: PageComparisonProps) {
  const wide = useMediaQuery("(min-width: 64rem)");
  const [[leftId, rightId], setPair] = useState(() => defaultPair(readings));
  const left = pick(readings, leftId);
  const right = pick(readings, rightId);
  const diff = diffReadings(left.text, right.text);
  const shared =
    left.id === right.id ? "same reading" : diff.differences === 0 ? "identical" : plural(diff.differences, "difference");

  const panes = [
    <PagePane key="page" number={number} preview={preview} />,
    <ReadingPane
      key="left"
      label="Left reading"
      readings={readings}
      selected={left.id}
      onSelect={(id) => setPair([id, rightId])}
      parts={diff.left}
      side="left"
      note={left.kept ? "kept" : shared}
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
    />,
  ];

  if (!wide) {
    return <div className="flex flex-col gap-4 [&>[data-slot=card]]:h-[32rem]">{panes}</div>;
  }
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-[calc(100svh-18rem)] min-h-[32rem]">
      {panes.map((pane, index) => (
        <Fragment key={pane.key}>
          {index > 0 && <ResizableHandle withHandle className="mx-2" />}
          <ResizablePanel defaultSize={`${100 / panes.length}%`} minSize="20%">
            {pane}
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}
