/**
 * What else complydoc could tell you about this folder, as commands to run.
 *
 * Each suggestion is there because of something this report did not measure or
 * found worth acting on, and names the command that fills the gap, against the
 * folder the report was made from.
 */
import type { Report } from "./types";

export interface NextStep {
  id: string;
  title: string;
  why: string;
  command: string;
  /** Whether it adds to the cost and time comparison. */
  timing: boolean;
}

/** A path as a shell reads it: quoted when it holds a space or a quote. */
function shell(path: string): string {
  return /^[\w./~-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\\\''")}'`;
}

export function nextSteps(report: Report): NextStep[] {
  const target = shell(report.run.target || ".");
  const steps: NextStep[] = [];
  const verified = report.documents.some((d) => d.verification);

  if (!verified) {
    steps.push({
      id: "verify",
      title: "Check every page against a vision model",
      why: "A second, independent read of each page, by a vision model of your own, says what the text kept missed and times the calls, which this report could only price. mymodels.py is yours: see the guide on verifying pages.",
      command: `complydoc audit ${target} --verify vision:mymodels:claude --verify-scope all`,
      timing: true,
    });
  }
  if (!report.run.ocr_compare_used) {
    steps.push({
      id: "ocr",
      title: "Time OCR on every page",
      why: "Reads every page from its picture as well as its text layer, so OCR can be weighed against the text layer on time and on what it reads.",
      command: `complydoc audit ${target} --ocr-compare`,
      timing: true,
    });
  }
  steps.push({
    id: "readers",
    title: "Put every reader side by side",
    why: "Reads each page with every extractor and OCR engine installed, timed, so the fastest reader that gets the words right can be picked.",
    command: `complydoc compare-readers ${target}`,
    timing: true,
  });
  steps.push({
    id: "loaders",
    title: "Compare the loaders your pipeline uses",
    why: "Runs LangChain or LlamaIndex loaders, or hosted parsers, over the same files: what each returns, costs and takes.",
    command: "complydoc compare-loaders loaders.yaml",
    timing: true,
  });
  if (report.aggregate.sensitive_total > 0) {
    steps.push({
      id: "clean",
      title: "Make copies with the identifiers masked",
      why: `This folder carries ${report.aggregate.sensitive_total} identifiers. The copies keep the documents usable with every one covered.`,
      command: `complydoc clean ${target} --out masked`,
      timing: false,
    });
  }
  steps.push({
    id: "check",
    title: "Hold the folder to a policy in CI",
    why: "Fails a build when a document breaks a rule: an identifier of a kind, hidden instructions, a readiness floor.",
    command: `complydoc check ${target} --policy policy.yaml`,
    timing: false,
  });
  steps.push({
    id: "chunks",
    title: "See how the text splits into chunks",
    why: "Splits each document with the splitters your retrieval uses, and shows where a clause or a table is cut in two.",
    command: `complydoc chunks ${target}`,
    timing: false,
  });
  return steps;
}
