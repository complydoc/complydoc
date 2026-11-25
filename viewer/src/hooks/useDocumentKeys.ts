import { useEffect } from "react";
import type { PageFinding } from "@/report/pageFindings";
import { documentHref } from "@/report/route";

/** Whether a key press belongs to a field, a menu or a dialog rather than to the page. */
export function keyIsTaken(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=listbox]")) return true;
  return document.querySelector("[role=dialog][data-state=open], [role=alertdialog]") !== null;
}

/**
 * The document page's keys, as Linear has them in an issue: J and K open the next and
 * previous finding, in the order the list beside the text shows them, [ and ] go to the
 * document before and after, and Escape closes the finding open, or goes back to the list
 * when none is.
 */
export function useDocumentKeys({
  previous,
  next,
  findings,
  active,
  onFinding,
}: {
  previous: number | null;
  next: number | null;
  findings: PageFinding[];
  active: string | null;
  onFinding: (key: string | null) => void;
}) {
  useEffect(() => {
    const order = [...findings].sort((a, b) => (a.page ?? 0) - (b.page ?? 0)).map((f) => f.key);
    const onKey = (event: KeyboardEvent) => {
      if (keyIsTaken(event)) return;
      const at = active === null ? -1 : order.indexOf(active);
      const key = event.key.toLowerCase();
      if (key === "j" && order.length > 0) onFinding(order[Math.min(at + 1, order.length - 1)] ?? null);
      else if (key === "k" && order.length > 0) onFinding(order[Math.max(at - 1, 0)] ?? null);
      else if (event.key === "[" && previous !== null) window.location.assign(documentHref(previous));
      else if (event.key === "]" && next !== null) window.location.assign(documentHref(next));
      else if (event.key === "Escape") {
        if (active !== null) onFinding(null);
        else window.location.assign("#documents");
      } else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previous, next, findings, active, onFinding]);
}
