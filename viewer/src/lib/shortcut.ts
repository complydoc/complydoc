/** Whether this machine says ⌘ or Ctrl for a shortcut. */
const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** A shortcut as this machine writes it: ⌘B on a Mac, Ctrl B elsewhere. */
export function shortcut(key: string): string {
  return MAC ? `⌘${key}` : `Ctrl ${key}`;
}
