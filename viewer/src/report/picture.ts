import type { Box, PagePreview } from "./types";

/** Whether a page has anything to draw: a picture, or at least the layout of its text. */
export function hasPicture(preview: PagePreview | undefined): preview is PagePreview {
  return Boolean(preview && (preview.image_data_uri || preview.text_blocks.length > 0));
}

/** A finding on the page, found among its boxes by its value and label. */
export interface BoxRef {
  /** The masked value. */
  value: string;
  label: string;
  /** The value itself, where the report holds it: a revealing run's boxes carry it instead. */
  revealed?: string | null;
}

/** Whether a box on the page is this finding, by the masked value or, in a revealing report, the value. */
export function isMarked(box: Box, ref: BoxRef | null | undefined): boolean {
  if (!ref || !box.title?.startsWith(ref.label)) return false;
  return box.value === ref.value || (Boolean(ref.revealed) && box.value === ref.revealed);
}

/** Whether a box on the page is one of the findings ignored. */
export function isIgnoredBox(box: Box, ignored: BoxRef[]): boolean {
  return ignored.some((ref) => isMarked(box, ref));
}
