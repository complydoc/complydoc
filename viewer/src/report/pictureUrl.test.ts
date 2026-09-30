import { describe, expect, it } from "vitest";
import { pictureUrl } from "./picture";
import type { PagePreview } from "./types";

const page = (fields: Partial<PagePreview>) => ({ image_data_uri: null, ...fields }) as PagePreview;

describe("pictureUrl", () => {
  it("uses a picture kept inside an older report", () => {
    expect(pictureUrl(page({ image_data_uri: "data:image/jpeg;base64,AAA" }), "api/reports/1")).toBe(
      "data:image/jpeg;base64,AAA",
    );
  });

  it("fetches a picture kept beside the report from complydoc ui", () => {
    const preview = page({ image: "complydoc.parts/pages/0003-0012.jpg" });
    expect(pictureUrl(preview, "api/reports/1")).toBe("api/reports/1/files/complydoc.parts/pages/0003-0012.jpg");
  });

  it("has none for a report opened as a file, without the folder beside it", () => {
    expect(pictureUrl(page({ image: "complydoc.parts/pages/0003-0012.jpg" }), null)).toBeNull();
  });
});
