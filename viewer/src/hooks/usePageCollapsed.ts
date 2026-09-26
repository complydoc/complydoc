import { useState } from "react";

const COLLAPSED_KEY = "complydoc.page-collapsed";

/** Whether the page's picture is put away, remembered in this browser across documents. */
export function usePageCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, set] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const update = (next: boolean) => {
    set(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Storage refused, as in a private window: it is folded for this visit only.
    }
  };
  return [collapsed, update];
}
