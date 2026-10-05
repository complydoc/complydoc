/**
 * The places last opened from the search menu, newest first, so the menu opens on where
 * the reader has just been. Kept in this browser, per run: a document's place in one run
 * is not its place in another.
 */
export interface Recent {
  run: string;
  /** Where it goes: `security`, `documents/3`. */
  hash: string;
  label: string;
  kind: "page" | "document";
}

const KEY = "complydoc.viewer.recents";
const KEPT = 20;
/** How many the menu shows for the run on screen. */
export const SHOWN = 4;

function read(): Recent[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Recent[]).filter((r) => r && typeof r.hash === "string") : [];
  } catch {
    return [];
  }
}

export function recentsFor(run: string): Recent[] {
  return read()
    .filter((r) => r.run === run)
    .slice(0, SHOWN);
}

export function remember(recent: Recent): void {
  try {
    const rest = read().filter((r) => !(r.run === recent.run && r.hash === recent.hash));
    window.localStorage.setItem(KEY, JSON.stringify([recent, ...rest].slice(0, KEPT)));
  } catch {
    // Without storage the menu has no recents, and works as before.
  }
}
