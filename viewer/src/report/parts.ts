/**
 * A large report keeps each document's page text and layout in a file beside it, fetched
 * when the document is opened. This puts that file back into its document.
 */
import type { Box, DocumentEntry, PagePreview, PageText } from "./types";

/** What a document's file beside the report holds, page by page. */
export interface DocumentPart {
  extracted_text: (Partial<PageText> & { number: number })[];
  previews: { number: number; text_blocks?: Box[]; image_blocks?: Box[]; gutters?: Box[]; sensitive?: Box[] }[];
}

/** `document` with its page text and layout from `part`, the pages matched by number. */
export function mergeParts(document: DocumentEntry, part: DocumentPart): DocumentEntry {
  const texts = new Map(part.extracted_text.map((page) => [page.number, page]));
  const layouts = new Map(part.previews.map((page) => [page.number, page]));
  const whole: DocumentEntry = {
    ...document,
    // The same page number on both sides, so the part's own spreads over it unchanged.
    extracted_text: document.extracted_text.map((page): PageText => ({ ...page, ...texts.get(page.number) })),
    previews: (document.previews ?? []).map((page): PagePreview => ({ ...page, ...layouts.get(page.number) })),
  };
  delete whole.parts;
  return whole;
}
