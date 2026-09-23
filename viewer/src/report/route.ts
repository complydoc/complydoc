/**
 * Where inside the Documents page a link points: a document, a page of it,
 * and a finding on that page to show.
 *
 * Written into the URL hash after `#documents/`, as `3`, `3/2` or `3/2/i5`,
 * so a finding on the Security page can link straight to where it sits.
 */

export type FindingRef = { kind: "identifier" | "hidden"; index: number };

export interface DocumentTarget {
  /** Position in the report's document list. */
  document: number;
  /** The page's number as printed, from 1; null for the first page. */
  page: number | null;
  finding: FindingRef | null;
}

const PREFIX = { identifier: "i", hidden: "h" } as const;

export function parseTarget(detail: string): DocumentTarget | null {
  const [document, page, finding] = detail.split("/");
  const index = Number(document);
  if (document === undefined || document === "" || !Number.isInteger(index) || index < 0) return null;
  const match = finding?.match(/^([ih])(\d+)$/);
  return {
    document: index,
    page: page && /^\d+$/.test(page) ? Number(page) : null,
    finding: match ? { kind: match[1] === "i" ? "identifier" : "hidden", index: Number(match[2]) } : null,
  };
}

export function documentHref(document: number, page?: number | null, finding?: FindingRef): string {
  const parts: (string | number)[] = [document];
  if (page !== undefined && page !== null) parts.push(page);
  if (finding && page !== undefined && page !== null) parts.push(`${PREFIX[finding.kind]}${finding.index}`);
  return `#documents/${parts.join("/")}`;
}
