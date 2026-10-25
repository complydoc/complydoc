/**
 * What kind of difference there is between two readings of a page.
 *
 * A diff shows every line that differs, and on a long document most of them are
 * line breaks. Sorting the differences into kinds says which ones matter: a number
 * read wrong matters more than a paragraph broken in a new place.
 */

export type DiffKind = "numbers" | "missing" | "characters" | "joined" | "order" | "added" | "spacing";

/** Worst first: the order a summary lists them in. */
export const DIFF_KINDS: DiffKind[] = ["numbers", "missing", "characters", "joined", "order", "added", "spacing"];

export interface PageDifference {
  page: number;
  kinds: DiffKind[];
  /** Words only the first reading has, and how many. */
  missing: number;
  /** Words only the second reading has. */
  added: number;
  /** Words read with a character or two wrong, first reading to second. */
  misread: [string, string][];
  /** Numbers the two readings disagree on, first reading to second. */
  numbers: [string, string][];
  /** Words one reading has apart and the other runs together, as the first reading has them to the second. */
  joined: [string, string][];
  /** How many words of the first reading the second runs together, with or without spaces lost elsewhere. */
  runWords: number;
  /** Words each reading holds once that sit in a different place. */
  moved: number;
}

const HYPHEN_BREAK = /(\w)-[ \t]*\n[ \t]*(\w)/g;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
/** A word that starts as a number does, however a reader went on to read the rest. */
const NUMBER = /^[-+(€$£]?\d/;
/** Words looked at on a page: a page longer than this is compared on its first words. */
const MAX_WORDS = 20_000;

/** The words of a reading as written, with line-break hyphens joined. */
function wordsOf(text: string): string[] {
  return text
    .normalize("NFKC")
    .replace(HYPHEN_BREAK, "$1$2")
    .split(/\s+/)
    .map((word) => word.replace(EDGE_PUNCTUATION, ""))
    .filter(Boolean)
    .slice(0, MAX_WORDS);
}

const fold = (word: string) => word.toLowerCase();

/** `left` without the words `right` also has, counting repeats. */
function without(left: string[], right: string[]): string[] {
  const counts = new Map<string, number>();
  for (const word of right) counts.set(fold(word), (counts.get(fold(word)) ?? 0) + 1);
  return left.filter((word) => {
    const left = counts.get(fold(word)) ?? 0;
    if (left === 0) return true;
    counts.set(fold(word), left - 1);
    return false;
  });
}

/** Whether `a` and `b` are the same word with at most two characters wrong. */
function nearly(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2 || Math.min(a.length, b.length) < 3) return false;
  const x = fold(a);
  const y = fold(b);
  let previous = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      const value = Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > 2) return false;
    previous = row;
  }
  return (previous[y.length] ?? 3) <= 2;
}

/** Whether two numbers are one read two ways: as long, give or take a character, and mostly alike in place. */
function sameNumber(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let alike = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) alike++;
  return alike * 2 >= Math.max(a.length, b.length);
}

/** Pairs each word of `left` with a near match in `right`, in order; what is paired is taken out. */
function pairNear(left: string[], right: string[], match: (a: string, b: string) => boolean) {
  const pairs: [string, string][] = [];
  const free = [...right];
  const unpaired: string[] = [];
  for (const word of left) {
    const at = free.findIndex((other) => match(word, other));
    if (at === -1) {
      unpaired.push(word);
      continue;
    }
    pairs.push([word, free[at] ?? ""]);
    free.splice(at, 1);
  }
  return { pairs, left: unpaired, right: free };
}

/**
 * Words of `apart` that `together` runs into one, as OCR does when it loses the spaces:
 * each long word of `together` that starts with two or more of `apart`'s words, in order,
 * and is at least half made of them. Half, because the rest of the run may be words the
 * other reading masked, or read another way.
 */
function runTogether(apart: string[], together: string[]) {
  const pieces = apart.map(fold);
  const used = new Set<number>();
  const pairs: [string, string][] = [];
  const unpaired: string[] = [];
  for (const word of together) {
    const target = fold(word);
    let found = -1;
    let end = -1;
    for (let start = 0; start < pieces.length && found === -1; start++) {
      let covered = 0;
      for (let k = start; k < pieces.length && !used.has(k); k++) {
        const piece = pieces[k] ?? "";
        if (!piece || !target.startsWith(piece, covered)) break;
        covered += piece.length;
        if (k > start && covered * 2 >= target.length) {
          found = start;
          end = k;
        }
      }
    }
    if (found === -1) {
      unpaired.push(word);
      continue;
    }
    for (let k = found; k <= end; k++) used.add(k);
    pairs.push([apart.slice(found, end + 1).join(" "), word]);
  }
  return { pairs, apart: apart.filter((_, index) => !used.has(index)), together: unpaired };
}

/**
 * How many words sit out of order, of the words each reading holds exactly once.
 *
 * Only words written once on both sides are placed: a page that repeats a phrase, or a
 * reading that loses one "the" of many, would otherwise read as words moved.
 */
function movedWords(first: string[], second: string[]): { moved: number; placed: number } {
  const once = (words: string[]) => {
    const counts = new Map<string, number>();
    for (const word of words) counts.set(fold(word), (counts.get(fold(word)) ?? 0) + 1);
    return counts;
  };
  const inFirst = once(first);
  const inSecond = once(second);
  const places = new Map<string, number>();
  second.forEach((word, index) => {
    if (inSecond.get(fold(word)) === 1 && inFirst.get(fold(word)) === 1) places.set(fold(word), index);
  });
  const order = first.flatMap((word) => {
    const place = places.get(fold(word));
    return place === undefined ? [] : [place];
  });
  // The longest increasing run of places, in n log n.
  const tails: number[] = [];
  for (const place of order) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((tails[middle] ?? 0) < place) low = middle + 1;
      else high = middle;
    }
    tails[low] = place;
  }
  return { moved: order.length - tails.length, placed: order.length };
}

/**
 * Words of `apart` found inside a long word of `together`: run into it, though the run is
 * read too poorly to match word for word ("a principal risk" read as "apricipalrisk").
 */
function inside(apart: string[], together: string[]): { found: string[]; hosts: Set<string> } {
  const long = together.filter((word) => word.length >= 8);
  const hosts = new Set<string>();
  if (apart.length * long.length > 2_000_000) return { found: [], hosts };
  const found = apart.filter((word) => {
    const key = fold(word);
    // A word of a letter or two is inside most long words: it counts only at a run's either end.
    const holds = (other: string) =>
      key.length >= 3 ? other.includes(key) : other.startsWith(key) || other.endsWith(key);
    const host = long.find((other) => other.length > key.length + 2 && holds(fold(other)));
    if (host) hosts.add(host);
    return host !== undefined;
  });
  return { found, hosts };
}

/** What differs between two readings of one page, or null when they read the same. */
export function explainPage(page: number, first: string, second: string): PageDifference | null {
  if (first.replace(/\s+/g, " ").trim() === second.replace(/\s+/g, " ").trim()) return null;
  const a = wordsOf(first);
  const b = wordsOf(second);
  // Runs looked for in the whole reading, before words are matched up one by one: matched
  // first, the "der" of a later sentence would take the place of the "Der" a run starts with.
  const runs = runTogether(a, without(b, a));
  const bLeft = without(b, runs.pairs.map(([, together]) => together));
  const splits = runTogether(bLeft, without(runs.apart, bLeft));
  const aLeft = without(runs.apart, splits.pairs.map(([, together]) => together));
  const joined = [...runs.pairs, ...splits.pairs.map(([apart, together]): [string, string] => [together, apart])];
  const onlyFirst = without(aLeft, splits.apart);
  const onlySecond = without(splits.apart, aLeft);

  const numbers = pairNear(
    onlyFirst.filter((w) => NUMBER.test(w)),
    onlySecond.filter((w) => NUMBER.test(w)),
    sameNumber,
  );
  const misread = pairNear(
    onlyFirst.filter((w) => !NUMBER.test(w)),
    onlySecond.filter((w) => !NUMBER.test(w)),
    nearly,
  );
  const extra = [...misread.right, ...numbers.right];
  const absorbed = inside([...misread.left, ...numbers.left], extra);
  const missing = misread.left.length + numbers.left.length - absorbed.found.length;
  const added = extra.filter((word) => !absorbed.hosts.has(word)).length;
  const runWords = joined.reduce((sum, [apart]) => sum + apart.split(" ").length, 0) + absorbed.found.length;
  const { moved, placed } = movedWords(a, b);

  const kinds: DiffKind[] = [];
  if (numbers.pairs.length) kinds.push("numbers");
  if (missing) kinds.push("missing");
  if (misread.pairs.length) kinds.push("characters");
  if (runWords) kinds.push("joined");
  // A word or two out of place is a line read in a new spot; a run of them is the page read in another order.
  if (moved > Math.max(3, placed * 0.05)) kinds.push("order");
  if (added) kinds.push("added");
  if (!kinds.length) kinds.push("spacing");
  return { page, kinds, missing, added, misread: misread.pairs, numbers: numbers.pairs, joined, runWords, moved };
}

export interface KindSummary {
  kind: DiffKind;
  pages: number[];
  /** Words for `missing` and `added`, words moved for `order`, pairs for `numbers` and `characters`. */
  count: number;
  /** The first few pairs, for `numbers`, `characters` and `joined`. */
  examples: [string, string][];
}

/** Each kind of difference across a document's pages, worst first. */
export function summarise(pages: PageDifference[]): KindSummary[] {
  return DIFF_KINDS.map((kind) => {
    const on = pages.filter((page) => page.kinds.includes(kind));
    const count = on.reduce((sum, page) => {
      if (kind === "missing") return sum + page.missing;
      if (kind === "added") return sum + page.added;
      if (kind === "order") return sum + page.moved;
      if (kind === "numbers") return sum + page.numbers.length;
      if (kind === "characters") return sum + page.misread.length;
      if (kind === "joined") return sum + page.runWords;
      return sum;
    }, 0);
    const examples = on.flatMap((page) => {
      if (kind === "numbers") return page.numbers;
      if (kind === "characters") return page.misread;
      return kind === "joined" ? page.joined : [];
    });
    const distinct = [...new Map(examples.map((pair) => [pair.join("\u0000"), pair])).values()];
    // A run of words together is long: two show what it is.
    const shown = kind === "joined" ? 2 : 3;
    return { kind, pages: on.map((page) => page.page), count, examples: distinct.slice(0, shown) };
  }).filter((summary) => summary.pages.length > 0);
}
