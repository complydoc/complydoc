import { useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { plural } from "@/report/format";
import { defaultPair, diffReadings, type Reading } from "@/report/readings";
import type { PagePreview } from "@/report/types";
import { PagePicture } from "./PagePicture";
import { ReadingPane } from "./ReadingPane";

interface PageComparisonProps {
  readings: Reading[];
  preview: PagePreview | undefined;
}

function pick(readings: Reading[], id: string): Reading {
  return readings.find((r) => r.id === id) ?? (readings[0] as Reading);
}

/**
 * The page and two of its readings side by side, with what each reading has
 * that the other lacks marked. Resizable on a wide screen, stacked on a narrow one.
 */
export function PageComparison({ readings, preview }: PageComparisonProps) {
  const wide = useMediaQuery("(min-width: 64rem)");
  const [[leftId, rightId], setPair] = useState(() => defaultPair(readings));
  const left = pick(readings, leftId);
  const right = pick(readings, rightId);
  const diff = diffReadings(left.text, right.text);
  const shared =
    left.id === right.id ? "same reading" : diff.differences === 0 ? "identical" : plural(diff.differences, "difference");

  const panes = [
    <PagePicture key="page" preview={preview} />,
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
    return <div className="flex flex-col gap-4 [&>[data-slot=card]]:h-96">{panes}</div>;
  }
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-[75vh] min-h-[32rem] gap-1">
      <ResizablePanel defaultSize="30%" minSize="15%" className="overflow-auto pr-2">
        {panes[0]}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="35%" minSize="20%" className="px-2">
        {panes[1]}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="35%" minSize="20%" className="pl-2">
        {panes[2]}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
