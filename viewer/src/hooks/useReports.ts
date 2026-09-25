import { useCallback, useState } from "react";
import type { Loaded } from "@/report/collections";
import { ReportError, parseReport } from "@/report/parse";

export interface ReportsState {
  loaded: Loaded[];
  /** Files that could not be opened, with why. */
  errors: string[];
}

let counter = 0;

function read(name: string, text: string, source?: string): Loaded | string {
  try {
    counter += 1;
    return { id: `${counter}:${name}`, name, report: parseReport(text), ...(source ? { source } : {}) };
  } catch (error) {
    return `${name}: ${error instanceof ReportError ? error.message : "The report could not be read."}`;
  }
}

/**
 * The reports open in this browser, and the ways to add and remove them.
 *
 * Every file is read here and goes nowhere else. Opening a file already open
 * adds it again as another run, which is what it is if it was written again.
 */
export function useReports(initial: () => ReportsState = () => ({ loaded: [], errors: [] })) {
  const [state, setState] = useState<ReportsState>(initial);

  const addTexts = useCallback((files: { name: string; text: string; source?: string }[]) => {
    const results = files.map((file) => read(file.name, file.text, file.source));
    setState((current) => ({
      loaded: [...current.loaded, ...results.filter((r): r is Loaded => typeof r !== "string")],
      errors: results.filter((r): r is string => typeof r === "string"),
    }));
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => addTexts(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })))),
    [addTexts],
  );

  const remove = useCallback((id: string) => {
    setState((current) => ({ ...current, loaded: current.loaded.filter((item) => item.id !== id) }));
  }, []);

  const closeAll = useCallback(() => setState({ loaded: [], errors: [] }), []);

  return { state, addTexts, addFiles, remove, closeAll };
}

/**
 * A report written into the page itself, as `<script type="application/json"
 * id="complydoc-report">`. How a future `complydoc view` would hand one over.
 */
export function embeddedReports(): ReportsState {
  const text = document.getElementById("complydoc-report")?.textContent;
  if (!text) return { loaded: [], errors: [] };
  const result = read("embedded report", text);
  return typeof result === "string" ? { loaded: [], errors: [result] } : { loaded: [result], errors: [] };
}
