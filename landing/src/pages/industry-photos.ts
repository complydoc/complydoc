/**
 * One photo per industry, by slug: src/assets/industries/<slug>.jpg, free under the Unsplash
 * License (photographers in credits.json). A drawing stands in for a missing one.
 */
export const PHOTOS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>("../assets/industries/*.jpg", { eager: true, import: "default" })).map(
    ([path, src]) => [path.split("/").pop()?.replace(".jpg", "") ?? "", src],
  ),
);
