const integer = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export function formatCount(value: number): string {
  return integer.format(value);
}

/** A 0 to 100 score as a whole number, or a dash when it could not be scored. */
export function formatScore(value: number | null): string {
  return value === null ? "–" : integer.format(value);
}

export function formatPercent(fraction: number): string {
  return `${integer.format(fraction * 100)}%`;
}

export function formatSeconds(seconds: number): string {
  if (seconds < 1) return `${integer.format(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${integer.format(seconds / 60)} min`;
}

/** "one document" or "3 documents". */
export function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${formatCount(count)} ${noun}s`;
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** "email_address" becomes "Email address". */
export function humanise(key: string): string {
  const words = key.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
