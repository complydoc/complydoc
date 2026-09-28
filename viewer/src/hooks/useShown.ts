import { useState } from "react";

/**
 * The first items of a long list, and a way to the rest a page at a time: a list of a
 * thousand documents' findings shows its first few, and draws no more than it is asked for.
 */
export function useShown<T>(items: T[], first = 8, step = 50): { shown: T[]; more: () => void; left: number } {
  const [count, setCount] = useState(first);
  const shown = items.slice(0, count);
  return { shown, more: () => setCount((current) => current + step), left: items.length - shown.length };
}
