import type { Report } from "./types";

/**
 * What a run can hold. Every page is always shown; a page whose content the run
 * did not produce says so and names the command that would.
 */
export type Content = "readiness" | "cost" | "sensitive" | "loaders" | "chunks" | "documents";

const COMPONENTS: readonly Content[] = ["readiness", "cost", "sensitive"];

/** Whether this run produced `content`. */
export function measured(report: Report, content: Content): boolean {
  if (COMPONENTS.includes(content)) {
    const run = report.run.components_run;
    // Reports that predate the field ran every component.
    return run === undefined || run.includes(content);
  }
  if (content === "loaders") return report.loader_comparison !== null;
  if (content === "chunks") return (report.chunks?.length ?? 0) > 0;
  return report.documents.length > 0;
}

/** A path as a shell reads it: quoted when it holds anything a shell would split or expand. */
function shellPath(path: string): string {
  return /^[\w@%+=:,./~-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;
}

/** The command that produces `content` for the folder this run read. */
export function commandFor(report: Report, content: Content): string {
  const target = shellPath(report.run.target);
  switch (content) {
    case "readiness":
      return `complydoc readiness ${target}`;
    case "cost":
      return `complydoc cost ${target}`;
    case "sensitive":
      return `complydoc sensitive ${target}`;
    case "loaders":
      return "complydoc compare-loaders loaders.yaml";
    case "chunks":
      return `complydoc chunks ${target} -s langchain_text_splitters:RecursiveCharacterTextSplitter`;
    case "documents":
      return `complydoc audit ${target}`;
  }
}
