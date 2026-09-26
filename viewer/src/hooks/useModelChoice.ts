import { useCallback, useState } from "react";
import { PLAN_KEYS, preferred } from "@/report/planChoice";
import type { PricedModel } from "@/report/pricing";

const KEYS = PLAN_KEYS;

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, id: string) {
  try {
    localStorage.setItem(key, id);
  } catch {
    // A private window or blocked storage: the choice lasts until the page closes.
  }
}

export interface ModelChoice {
  /** The model pages are priced on as text. Any priced model. */
  text: PricedModel | null;
  /** The model pages are priced on as images. Only a model that takes images. */
  vision: PricedModel | null;
  chooseText: (id: string) => void;
  chooseVision: (id: string) => void;
}

/**
 * Which models a page is priced on, remembered in this browser.
 *
 * A remembered model the report did not compare falls back to one from the
 * same provider, then to the report's first, so a choice made on one report
 * never leaves another blank.
 */
export function useModelChoice(models: PricedModel[]): ModelChoice {
  const visionModels = models.filter((m) => m.vision);
  const [textId, setTextId] = useState(() => stored(KEYS.text));
  const [visionId, setVisionId] = useState(() => stored(KEYS.vision));
  const [textProvider, setTextProvider] = useState(() => stored(KEYS.textProvider));
  const [visionProvider, setVisionProvider] = useState(() => stored(KEYS.visionProvider));

  const chooseText = useCallback(
    (id: string) => {
      const provider = models.find((m) => m.id === id)?.provider ?? null;
      setTextId(id);
      remember(KEYS.text, id);
      setTextProvider(provider);
      if (provider) remember(KEYS.textProvider, provider);
    },
    [models],
  );
  const chooseVision = useCallback(
    (id: string) => {
      const provider = models.find((m) => m.id === id)?.provider ?? null;
      setVisionId(id);
      remember(KEYS.vision, id);
      setVisionProvider(provider);
      if (provider) remember(KEYS.visionProvider, provider);
    },
    [models],
  );

  return {
    text: preferred(models, textId, textProvider),
    vision: preferred(visionModels, visionId, visionProvider),
    chooseText,
    chooseVision,
  };
}
