import { useCallback, useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHash() {
  return window.location.hash.slice(1);
}

/** The hash's place, before any `?`. */
function readPlace() {
  return readHash().split("?")[0] ?? "";
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
  const hash = useSyncExternalStore(subscribe, readPlace, () => "");
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

/**
 * One setting of the page on screen, kept after a `?` in the hash (`#security?severity=high`),
 * so a filtered view can be linked, bookmarked and reopened. Changing it replaces the
 * address rather than adding to the history, so Back leaves the page, not the filter.
 */
export function useHashParam(name: string): [string | null, (value: string | null) => void] {
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const [, query = ""] = hash.split("?");
  const value = new URLSearchParams(query).get(name);

  const set = useCallback(
    (next: string | null) => {
      const [place = "", current = ""] = readHash().split("?");
      const params = new URLSearchParams(current);
      if (next === null) params.delete(name);
      else params.set(name, next);
      const rest = params.toString();
      window.history.replaceState(null, "", `#${place}${rest ? `?${rest}` : ""}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    },
    [name],
  );

  return [value, set];
}
