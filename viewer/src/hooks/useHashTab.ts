import { useCallback, useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHash() {
  return window.location.hash.slice(1);
}

/**
 * The open tab, kept in the URL hash so a link or a reload lands on the same page.
 *
 * An unknown hash falls back to the first tab.
 */
export function useHashTab<T extends string>(tabs: readonly T[]): [T, (tab: T) => void] {
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const current = tabs.find((tab) => tab === hash) ?? (tabs[0] as T);

  const select = useCallback((tab: T) => {
    window.location.hash = tab;
  }, []);

  return [current, select];
}
