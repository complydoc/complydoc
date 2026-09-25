import type { PagePreview } from "./types";

/** Whether a page has anything to draw: a picture, or at least the layout of its text. */
export function hasPicture(preview: PagePreview | undefined): preview is PagePreview {
  return Boolean(preview && (preview.image_data_uri || preview.text_blocks.length > 0));
}
