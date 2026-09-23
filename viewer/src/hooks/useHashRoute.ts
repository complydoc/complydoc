import { useCallback, useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHash() {
  return window.location.hash.slice(1);
}

export interface Route<T extends string> {
  page: T;
  /** What is open inside the page, such as a document's index. */
  detail: string | null;
}

/**
 * Where the viewer is, kept in the URL hash (`#documents/3`), so a link, a
 * reload or the back button lands in the same place. An unknown page falls
 * back to the first.
 */
export function useHashRoute<T extends string>(pages: readonly T[]): [Route<T>, (page: T, detail?: string) => void] {
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const [head = "", ...rest] = hash.split("/");
  const page = pages.find((p) => p === head);
  const route: Route<T> = page
    ? { page, detail: rest.length > 0 ? decodeURIComponent(rest.join("/")) : null }
    : { page: pages[0] as T, detail: null };

  const go = useCallback((next: T, detail?: string) => {
    window.location.hash = detail === undefined ? next : `${next}/${encodeURIComponent(detail)}`;
  }, []);

  return [route, go];
}
