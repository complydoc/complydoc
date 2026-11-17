/** The palette's hues, as Tailwind classes spelled out so the stylesheet keeps each. */
export type Hue = "blue" | "indigo" | "violet" | "mint" | "amber" | "coral";

/** Spelled out, so the stylesheet keeps each class. */
export const HUE_TEXT: Record<Hue, string> = {
  blue: "text-viz-blue",
  indigo: "text-viz-indigo",
  violet: "text-viz-violet",
  mint: "text-viz-mint",
  amber: "text-viz-amber",
  coral: "text-viz-coral",
};

export const HUE_BG: Record<Hue, string> = {
  blue: "bg-viz-blue",
  indigo: "bg-viz-indigo",
  violet: "bg-viz-violet",
  mint: "bg-viz-mint",
  amber: "bg-viz-amber",
  coral: "bg-viz-coral",
};
