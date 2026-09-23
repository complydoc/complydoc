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
  /** Leave room below for something else on screen, such as the page picker. */
  reserve?: boolean;
}

function pick(readings: Reading[], id: string): Reading {
  return readings.find((r) => r.id === id) ?? (readings[0] as Reading);
}

/**
 * The page and two of its readings side by side, with what each reading has
 * that the other lacks marked. Three equal panes of one height, resizable on a
 * wide screen and stacked on a narrow one. A page read only one way has
 * nothing to compare, so it is the page and that reading, in two halves.
 */
export function PageComparison({ number, name, readings, preview, highlight, reserve = false }: PageComparisonProps) {
  const wide = useMediaQuery("(min-width: 64rem)");
  const [[leftId, rightId], setPair] = useState(() => defaultPair(readings));
  const left = pick(readings, leftId);
  const right = pick(readings, rightId);
  const diff = diffReadings(left.text, right.text);
  const shared =
    left.id === right.id ? "same reading" : diff.differences === 0 ? "identical" : plural(diff.differences, "difference");

  const single = readings.length < 2;
  const needle = highlight?.needle ?? null;
  const page = <PagePane key="page" number={number} name={name} preview={preview} mark={highlight?.box ?? null} />;

  const panes = single
    ? [
        page,
        <ReadingPane
          key="only"
          label="Reading"
          readings={readings}
          selected={left.id}
          onSelect={() => {}}
          parts={[{ text: left.text, changed: false }]}
          side="left"
          note={left.kept ? "kept" : "only reading"}
          needle={needle}
        />,
      ]
    : [
        page,
        <ReadingPane
          key="left"
          label="Left reading"
          readings={readings}
          selected={left.id}
          onSelect={(id) => setPair([id, rightId])}
          parts={diff.left}
          side="left"
          note={left.kept ? "kept" : shared}
          needle={needle}
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
          needle={needle}
        />,
      ];

  if (!wide) {
    return <div className="flex flex-col gap-4 [&>[data-slot=card]]:h-[32rem]">{panes}</div>;
  }
  return (
    // The panel library sizes its group to 100% of the parent, so the parent carries the height.
    <div className={reserve ? "h-[calc(100svh-16rem)] min-h-[34rem]" : "h-[calc(100svh-13rem)] min-h-[36rem]"}>
      <ResizablePanelGroup orientation="horizontal">
        {panes.map((pane, index) => (
          <Fragment key={pane.key}>
            {index > 0 && <ResizableHandle withHandle className="mx-2" />}
            {/* A card's border is a ring drawn just outside it; the padding keeps the panel from clipping it. */}
            <ResizablePanel defaultSize={`${100 / panes.length}%`} minSize={single ? "30%" : "20%"} className="p-px">
              {pane}
            </ResizablePanel>
          </Fragment>
        ))}
      </ResizablePanelGroup>
    </div>
  );
}
