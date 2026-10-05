import type { RowSelectionState } from "@tanstack/react-table";
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

/**
 * X picks the row under the pointer, or lets it go; Escape lets every picked row go, as in
 * Linear. Keys typed into a field, or pressed with ⌘, Ctrl or Alt, are left alone.
 */
export function usePickKeys(
  enabled: boolean,
  picked: RowSelectionState,
  setPicked: Dispatch<SetStateAction<RowSelectionState>>,
  hovered: RefObject<string | null>,
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const id = hovered.current;
      if (event.key.toLowerCase() === "x" && id) {
        event.preventDefault();
        setPicked((current) =>
          current[id]
            ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== id))
            : { ...current, [id]: true },
        );
      } else if (event.key === "Escape" && Object.keys(picked).length > 0) {
        event.preventDefault();
        setPicked({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, picked, setPicked, hovered]);
}
