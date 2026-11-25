import type { Plan } from "./plan";
import { documentTree, type TreeNode } from "./tree";
import type { Report } from "./types";

/**
 * The report's documents in the order the Documents list shows them, folders first and each
 * by name: the order previous and next follow, so stepping through matches the list.
 */
export function documentOrder(report: Report, plan: Plan): number[] {
  const order: number[] = [];
  const walk = (node: TreeNode) => {
    if (node.document) order.push(node.document.index);
    node.children?.forEach(walk);
  };
  documentTree(report, plan).forEach(walk);
  return order;
}

/** The documents before and after `index` in that order, null at either end. */
export function neighbours(
  report: Report,
  plan: Plan,
  index: number,
): { previous: number | null; next: number | null; position: number; total: number } {
  const order = documentOrder(report, plan);
  const at = order.indexOf(index);
  return {
    previous: at > 0 ? (order[at - 1] ?? null) : null,
    next: at >= 0 && at < order.length - 1 ? (order[at + 1] ?? null) : null,
    position: at + 1,
    total: order.length,
  };
}
