/**
 * The documents as the folder they came from: each folder carrying what its
 * documents cost and take to read under the plan chosen, added up.
 */
import { EMPTY, combine, documentTotals, type Plan, type Totals } from "./plan";
import { SEVERITIES, documentRows, type DocumentRow } from "./select";
import type { Report, Severity } from "./types";

export interface TreeNode {
  id: string;
  name: string;
  kind: "folder" | "file";
  /** The document itself, for a file. */
  document?: DocumentRow;
  totals: Totals;
  /** Readiness: the document's score, or a folder's mean over the documents scored. */
  score: number | null;
  findings: number;
  highest: Severity | null;
  children?: TreeNode[];
}

function worst(a: Severity | null, b: Severity | null): Severity | null {
  if (a === null) return b;
  if (b === null) return a;
  return SEVERITIES.indexOf(a) <= SEVERITIES.indexOf(b) ? a : b;
}

function folder(id: string, name: string, children: TreeNode[]): TreeNode {
  const scored = children.flatMap((c) => leaves(c)).filter((d) => d.score !== null);
  return {
    id,
    name,
    kind: "folder",
    totals: children.reduce((sum, child) => combine(sum, child.totals), EMPTY),
    score: scored.length ? scored.reduce((sum, d) => sum + (d.score ?? 0), 0) / scored.length : null,
    findings: children.reduce((sum, child) => sum + child.findings, 0),
    highest: children.reduce<Severity | null>((w, child) => worst(w, child.highest), null),
    children,
  };
}

function leaves(node: TreeNode): TreeNode[] {
  return node.kind === "file" ? [node] : (node.children ?? []).flatMap(leaves);
}

/** Folders first, then documents, each by name. */
function ordered(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1));
}

/** The report's documents nested by folder, every folder totalled. */
export function documentTree(report: Report, plan: Plan): TreeNode[] {
  const root = new Map<string, unknown>();
  for (const row of documentRows(report)) {
    const document = report.documents[row.index];
    if (!document) continue;
    const parts = row.path.split(/[\\/]/).filter(Boolean);
    let level = root;
    for (const part of parts.slice(0, -1)) {
      if (!level.has(`${part}/`)) level.set(`${part}/`, new Map<string, unknown>());
      level = level.get(`${part}/`) as Map<string, unknown>;
    }
    const file: TreeNode = {
      id: `file:${row.index}`,
      name: parts.at(-1) ?? row.path,
      kind: "file",
      document: row,
      totals: documentTotals(report, document, plan),
      score: row.score,
      findings: row.findings,
      highest: row.highest,
    };
    level.set(file.name, file);
  }

  const build = (level: Map<string, unknown>, prefix: string): TreeNode[] =>
    ordered(
      [...level].map(([key, value]) => {
        if (!(value instanceof Map)) return value as TreeNode;
        // A folder holding only one folder is one row, "a/b", as a file browser shows it.
        let name = key.slice(0, -1);
        let path = `${prefix}${key}`;
        let inner = value as Map<string, unknown>;
        while (inner.size === 1) {
          const [only, next] = [...inner][0] as [string, unknown];
          if (!(next instanceof Map)) break;
          name = `${name}/${only.slice(0, -1)}`;
          path = `${path}${only}`;
          inner = next as Map<string, unknown>;
        }
        return folder(`folder:${path}`, name, build(inner, path));
      }),
    );
  return build(root, "");
}
