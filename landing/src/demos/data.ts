/**
 * The two demos' data, written by `scripts/demos/make_demos.py` from real runs.
 * Rerun the script rather than editing the JSON.
 */
import hiddenJson from "@/data/hidden.json";
import loadersJson from "@/data/loaders.json";

export type FactResult = "exact" | "fuzzy" | null;

export interface LoaderPage {
  id: string;
  file: string;
  page: number;
  title: string;
  story: string;
  image: string;
  width: number;
  height: number;
  texts: Record<string, string>;
  fact: { text: string; found: Record<string, FactResult> };
  identifier_differences: { label: string; value: string; found_by: string[]; missed_by: string[] }[];
}

export interface HiddenCase {
  id: string;
  file: string;
  title: string;
  story: string;
  page: number;
  image: string;
  width: number;
  height: number;
  finding: {
    excerpt: string;
    hidden_reasons: string[];
    visibility: string;
    severity: string;
    instruction: string;
    instruction_reasons: string[];
  };
  boxes: { x: number; y: number; w: number; h: number; size_pt: number }[];
  model_text: { before: string; hidden: string; after: string };
}

export const LOADER_DEMO = loadersJson as {
  complydoc: string;
  loaders: { name: string; library: string }[];
  pages: LoaderPage[];
};

export const HIDDEN_DEMO = hiddenJson as { complydoc: string; cases: HiddenCase[] };

const images = import.meta.glob<string>("@/assets/demos/*.webp", { eager: true, import: "default" });

/** The URL Vite gave a page picture the script wrote. */
export function demoImage(name: string): string {
  const url = Object.entries(images).find(([path]) => path.endsWith(`/${name}`))?.[1];
  if (!url) throw new Error(`no demo picture ${name}`);
  return url;
}
