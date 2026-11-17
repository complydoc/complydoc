/**
 * A word-level diff of two readings of one page, for showing them side by side.
 *
 * Whitespace is kept as each reader wrote it, so a reader that puts every cell
 * of a table on its own line still looks like that, but only words are
 * compared: two readings that differ in line breaks alone have nothing marked.
 */

export interface Token {
  text: string;
  /** Whitespace, never marked. */
  space: boolean;
  /** A word the other reading does not have at this point. */
  changed: boolean;
}

export interface WordDiff {
  left: Token[];
  right: Token[];
  /** Words in common, in order, as a share of both readings' words, from 0 to 1. */
  similarity: number;
  /** Words only the left reading has, and only the right. */
  onlyLeft: number;
  onlyRight: number;
}

function tokenize(text: string): Token[] {
  return text
    .split(/(\s+)/)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, space: /^\s+$/.test(part), changed: false }));
}

/** The longest common subsequence of two word lists, as a table walked from the end. */
function commonWords(a: string[], b: string[]): [boolean[], boolean[]] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  const keptA = new Array<boolean>(n).fill(false);
  const keptB = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keptA[i++] = true;
      keptB[j++] = true;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) i++;
    else j++;
  }
  return [keptA, keptB];
}

export function wordDiff(leftText: string, rightText: string): WordDiff {
  const left = tokenize(leftText);
  const right = tokenize(rightText);
  const leftWords = left.filter((t) => !t.space);
  const rightWords = right.filter((t) => !t.space);
  const [keptLeft, keptRight] = commonWords(
    leftWords.map((t) => t.text),
    rightWords.map((t) => t.text),
  );
  leftWords.forEach((token, index) => (token.changed = !keptLeft[index]));
  rightWords.forEach((token, index) => (token.changed = !keptRight[index]));
  const common = keptLeft.filter(Boolean).length;
  const total = leftWords.length + rightWords.length;
  return {
    left,
    right,
    similarity: total === 0 ? 1 : (2 * common) / total,
    onlyLeft: leftWords.length - common,
    onlyRight: rightWords.length - common,
  };
}
