import { describe, expect, it } from "vitest";
import { required, sampleAudit } from "@/test/sample";
import { mergeParts } from "./parts";
import type { PageText } from "./types";

/** A page as a large report keeps it in its JSON: its text beside it, each reading held. */
function held(page: PageText): PageText {
  const readings = Object.fromEntries(Object.entries(page.readings).map(([name, text]) => [name, text ? "…" : ""]));
  return { ...page, text: "", ocr_text: "", readings };
}

describe("mergeParts", () => {
  it("puts a document's page text and layout back, page by page", () => {
    const whole = required(sampleAudit().documents.find((d) => d.extracted_text.length > 0));
    const kept = {
      ...whole,
      parts: "complydoc.parts/documents/0000.json",
      extracted_text: whole.extracted_text.map(held),
    };
    const back = mergeParts(kept, {
      extracted_text: whole.extracted_text.map((p) => ({
        number: p.number,
        text: p.text,
        ocr_text: p.ocr_text,
        readings: p.readings,
      })),
      previews: [],
    });
    expect(back.parts).toBeUndefined();
    expect(back.extracted_text).toEqual(whole.extracted_text);
  });
});
