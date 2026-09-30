/** Where the documentation is, and which guide explains each page of the viewer. */
import type { Page } from "@/app/pages";

const DOCS = "https://complydoc.github.io/complydoc/docs";

const GUIDES: Partial<Record<Page, string>> = {
  home: "guides/viewer/",
  pipeline: "guides/observe-a-pipeline/",
  security: "reference/identifiers/",
  cost: "guides/audit-a-folder/",
  documents: "guides/viewer/",
  chunks: "guides/inspect-chunks/",
  settings: "guides/ignore-findings/",
};

/** The guide for a page of the viewer, or the documentation's front page. */
export function guideFor(page: Page): string {
  return `${DOCS}/${GUIDES[page] ?? ""}`;
}
