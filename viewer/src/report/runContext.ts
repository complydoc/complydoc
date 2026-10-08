import type { RunContext } from "./types";

/** A commit id as people say it: its first seven characters. */
export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/** The branch and commit a run came from, in a few characters: `main · 1b84563`. */
export function contextLabel(context: RunContext | null | undefined): string {
  if (!context) return "";
  const commit = context.commit ? shortCommit(context.commit) + (context.dirty ? " +changes" : "") : "";
  return [context.branch, commit].filter(Boolean).join(" · ");
}

/** The rest of what is known, for a tooltip: the repository and the CI workflow. */
export function contextDetail(context: RunContext | null | undefined): string {
  if (!context) return "";
  return [context.repository, context.workflow].filter(Boolean).join(" · ");
}

/** The page of the CI run, when it is one a browser should open. */
export function contextUrl(context: RunContext | null | undefined): string | null {
  const url = context?.url ?? "";
  return /^https?:\/\//i.test(url) ? url : null;
}
