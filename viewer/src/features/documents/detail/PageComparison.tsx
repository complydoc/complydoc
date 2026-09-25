import { Fragment, useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { plural } from "@/report/format";
import { formatPageUsd } from "@/report/format";
import { imagePrice, textPrice, type PricedModel } from "@/report/pricing";
import { defaultPair, diffReadings, isVision, type Reading } from "@/report/readings";
import type { Highlight } from "@/report/highlight";
import type { PagePreview, PageText } from "@/report/types";
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
  /** The page and the models to price each reading of it on. */
  pricing?: { page: PageText; text: PricedModel | null; vision: PricedModel | null } | null;
}

/**
 * What sending one reading on to a model costs for this page. A vision reading
 * is priced as the page image on the vision model; every other as its own text
 * on the text model, since each reader leaves a different number of tokens.
 */
function priceOf(reading: Reading, pricing: PageComparisonProps["pricing"]) {
  if (!pricing) return null;
  const { page, text, vision } = pricing;
  const [model, price] = isVision(reading)
    ? [vision, vision ? imagePrice(page, vision) : null]
    : [text, text ? textPrice(page, reading.key, text) : null];
  if (!model || !price) return null;
  return {
    label: `${formatPageUsd(price.usd)} per page ${isVision(reading) ? "as an image " : ""}on ${model.name}`,
    title: `${price.tokens.toLocaleString("en-GB")} ${isVision(reading) ? "image" : "text"} tokens at $${model.inputPerMtok} per million input tokens`,
  };
}

function pick(readings: Reading[], id: string): Reading {
  return readings.find((r) => r.id === id) ?? (readings[0] as Reading);
}

/**
 * The page and two of its readings side by side, with what each reading has
 * that the other lacks marked. Three panes of one height, the page the widest,
 * resizable on a wide screen and stacked on a narrow one. A page read only one way has
 * nothing to compare, so it is the page and that reading, in two halves.
 */
export function PageComparison({
  number,
  name,
  readings,
  preview,
  highlight,
  reserve = false,
  pricing = null,
}: PageComparisonProps) {
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
          note={null}
          needle={needle}
          price={priceOf(left, pricing)}
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
          note={left.kept ? null : shared}
          needle={needle}
          price={priceOf(left, pricing)}
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
          price={priceOf(right, pricing)}
        />,
      ];

  // The page takes the larger share: a portrait page fills its pane's width long
  // before its height, so width is what makes it readable. Readings share the rest.
  const sizes = single ? ["50%", "50%"] : ["42%", "29%", "29%"];

  if (!wide) {
    return <div className="flex flex-col gap-4 [&>[data-slot=card]]:h-[32rem]">{panes}</div>;
  }
  return (
    // The panel library sizes its group to 100% of the parent, so the parent carries the height.
    // As tall as the window allows below the title, less the picker's row when there is one.
    <div className={reserve ? "h-[calc(100svh-13rem)] min-h-[34rem]" : "h-[calc(100svh-9.5rem)] min-h-[36rem]"}>
      <ResizablePanelGroup orientation="horizontal">
        {panes.map((pane, index) => (
          <Fragment key={pane.key}>
            {index > 0 && <ResizableHandle withHandle className="mx-2" />}
            {/* A card's border is a ring drawn just outside it; the padding keeps the panel from clipping it. */}
            <ResizablePanel defaultSize={sizes[index]} minSize={single ? "30%" : "20%"} className="p-px">
              {pane}
            </ResizablePanel>
          </Fragment>
        ))}
      </ResizablePanelGroup>
    </div>
  );
}
