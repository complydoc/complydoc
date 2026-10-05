import { useEffect } from "react";
import { GO_KEY, PAGES } from "@/app/pages";

/** How long after G the next key still counts as where to go. */
const WINDOW_MS = 1200;

/** Whether a key went to something being typed into, which a shortcut must leave alone. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * G then a page's key opens that page, and ? asks for the list of shortcuts, as in Linear.
 * Keys typed into a field, or pressed with ⌘, Ctrl or Alt, are left to whatever has them.
 * Without `pages`, as on the overview of every folder where no run is open, G goes nowhere:
 * moving the address there would change nothing on screen.
 */
export function useGoKeys(onHelp: () => void, pages = true) {
  useEffect(() => {
    let pressedG = 0;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        onHelp();
        return;
      }
      const key = event.key.toUpperCase();
      if (!pages) return;
      if (pressedG && Date.now() - pressedG < WINDOW_MS) {
        pressedG = 0;
        const page = PAGES.find((p) => GO_KEY[p] === key);
        if (page) {
          event.preventDefault();
          window.location.assign(`#${page}`);
        }
        return;
      }
      pressedG = key === "G" ? Date.now() : 0;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onHelp, pages]);
}
