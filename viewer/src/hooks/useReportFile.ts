import { useCallback, useState } from "react";
import { ReportError, parseReport } from "@/report/parse";
import type { Report } from "@/report/types";

export type ReportState =
  | { status: "empty" }
  | { status: "loading"; name: string }
  | { status: "ready"; name: string; report: Report }
  | { status: "error"; name: string; message: string };

function toState(name: string, text: string): ReportState {
  try {
    return { status: "ready", name, report: parseReport(text) };
  } catch (error) {
    const message = error instanceof ReportError ? error.message : "The report could not be read.";
    return { status: "error", name, message };
  }
}

/**
 * The report on screen, and the ways to open one.
 *
 * Reading happens in the browser: the file never leaves the machine.
 */
export function useReportFile(initial: () => ReportState = () => ({ status: "empty" })) {
  const [state, setState] = useState<ReportState>(initial);

  const openText = useCallback((name: string, text: string) => {
    setState(toState(name, text));
  }, []);

  const openFile = useCallback(async (file: File) => {
    setState({ status: "loading", name: file.name });
    setState(toState(file.name, await file.text()));
  }, []);

  const close = useCallback(() => setState({ status: "empty" }), []);

  return { state, openText, openFile, close };
}

/**
 * A report written into the page itself, as `<script type="application/json"
 * id="complydoc-report">`. How a future `complydoc view` would hand one over.
 */
export function embeddedReport(): ReportState {
  const text = document.getElementById("complydoc-report")?.textContent;
  return text ? toState("embedded report", text) : { status: "empty" };
}
