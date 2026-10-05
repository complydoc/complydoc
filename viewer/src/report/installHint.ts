/**
 * complydoc's hint for a model it could not load reads "Names need … With pip: <command>.
 * With uv: <command>. Keep any extras …". Split, it can say what is missing in one line
 * and hand over each command to copy, rather than printing both inline.
 */
export interface InstallHint {
  /** What is missing, as one sentence. */
  summary: string;
  pip: string | null;
  uv: string | null;
}

const HINT = /^(.*?)\s*With pip:\s*(.+?)\.\s*With uv:\s*(.+?)\.(?:\s|$)/s;

export function installHint(reason: string): InstallHint {
  const text = reason.trim();
  const found = HINT.exec(text);
  const summary = (found?.[1] ?? text).trim();
  return {
    summary: summary.charAt(0).toUpperCase() + summary.slice(1),
    pip: found?.[2]?.trim() ?? null,
    uv: found?.[3]?.trim() ?? null,
  };
}
