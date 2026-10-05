export interface Note {
  id: number;
  message: string;
  tone: "done" | "info";
}

const listeners = new Set<(note: Note) => void>();
let counter = 0;

/**
 * Say, for a moment, that something happened: a path copied, a finding set aside. Linear's
 * confirmations sit at the bottom corner, say one thing, and leave by themselves.
 */
export function toast(message: string, tone: Note["tone"] = "done") {
  const note = { id: ++counter, message, tone };
  for (const listener of listeners) listener(note);
}

/** Hear every note `toast` gives; returns how to stop. */
export function onToast(listener: (note: Note) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Copy `text`, and say so. */
export function copyWithToast(text: string, what: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast(`${what} copied`),
    () => toast(`Could not copy the ${what.toLowerCase()}`, "info"),
  );
}
