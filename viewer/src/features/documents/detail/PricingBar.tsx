import { ModelPicker } from "@/components/ModelPicker";
import { formatPageUsd } from "@/report/format";
import { imagePrice, textPrice, type PricedModel } from "@/report/pricing";
import type { ModelChoice } from "@/hooks/useModelChoice";
import type { PageText } from "@/report/types";

interface PricingBarProps {
  page: PageText;
  /** The reader whose text the page kept, which is what the text price is for. */
  reader: string;
  models: PricedModel[];
  choice: ModelChoice;
}

/**
 * The two models this page is priced on: one for text, which prices every
 * reader's text, and one for images, which only lists models that take them.
 */
export function PricingBar({ page, reader, models, choice }: PricingBarProps) {
  const text = choice.text ? textPrice(page, reader, choice.text) : null;
  const image = choice.vision ? imagePrice(page, choice.vision) : null;
  return (
    <div role="group" aria-label="Price this page" className="flex flex-wrap items-center justify-end gap-x-2 gap-y-2 text-sm">
      <ModelPicker label="Text model" models={models} value={choice.text} onChange={choice.chooseText} />
      <span
        className="min-w-16 tabular-nums"
        aria-label="This page as text"
        title={text ? `${text.tokens.toLocaleString("en-GB")} tokens of extracted text` : undefined}
      >
        {text ? formatPageUsd(text.usd) : "–"}
      </span>
      <ModelPicker label="Vision model" models={models} value={choice.vision} onChange={choice.chooseVision} visionOnly />
      <span
        className="min-w-16 tabular-nums"
        aria-label="This page as an image"
        title={image ? `${image.tokens.toLocaleString("en-GB")} image tokens` : "The page's size was not measured"}
      >
        {image ? formatPageUsd(image.usd) : "–"}
      </span>
    </div>
  );
}
