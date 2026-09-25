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
  if (seconds < 3600) return `${integer.format(seconds / 60)} min`;
  if (seconds < 172_800) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  return `${(seconds / 86_400).toFixed(1)} days`;
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

/** Dollars, to the cent, or to four places when the sum is under a cent. */
export function formatUsd(value: number | null): string {
  if (value === null) return "–";
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return `$${value.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/**
 * A per-page price, to four places under a dollar. One page through a model
 * costs fractions of a cent to a few cents, and at two places a vision read and
 * a cheaper one round to the same figure.
 */
export function formatPageUsd(value: number | null): string {
  if (value === null) return "–";
  const digits = value !== 0 && Math.abs(value) < 1 ? 4 : 2;
  return `$${value.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** An ISO date as a person reads it, such as "25 Sept 2026"; the input as it was when it is not a date. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-GB", { dateStyle: "medium" });
}
