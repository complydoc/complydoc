import { useEffect, useState } from "react";

/** Where `complydoc ui` says the reports are, written into the page it serves. */
export interface LocalConfig {
  /** The list of reports, relative to the page. */
  reports: string;
  /** The folders the server searches, as the command was given them. */
  sources: string[];
}

interface ListedReport {
  id: string;
  name: string;
  url: string;
}

export interface LocalState {
  /** `off` when the page was opened some other way, as a file or from a dev server. */
  status: "off" | "loading" | "ready" | "failed";
  sources: string[];
  error?: string;
}

/** The server's settings, when the page was served by `complydoc ui`. */
export function localConfig(): LocalConfig | null {
  const text = document.getElementById("complydoc-local")?.textContent;
  if (!text) return null;
  try {
    const data = JSON.parse(text) as Partial<LocalConfig>;
    return typeof data.reports === "string" ? { reports: data.reports, sources: data.sources ?? [] } : null;
  } catch {
    return null;
  }
}

/**
 * The reports `complydoc ui` found, opened as soon as the page loads.
 *
 * They come from the server on this machine that served the page; the viewer
 * asks nothing of any other.
 */
export function useLocalReports(
  addTexts: (files: { name: string; text: string; source?: string }[]) => void,
): LocalState {
  const [config] = useState(localConfig);
  const [state, setState] = useState<LocalState>(() => ({
    status: config ? "loading" : "off",
    sources: config?.sources ?? [],
  }));

  useEffect(() => {
    if (!config) return;
    const abort = new AbortController();
    const get = async (url: string) => {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
      return response;
    };
    (async () => {
      try {
        const list = (await (await get(config.reports)).json()) as { reports: ListedReport[] };
        const files = await Promise.all(
          list.reports.map(async (report) => ({
            name: report.name,
            text: await (await get(report.url)).text(),
            source: report.url,
          })),
        );
        if (abort.signal.aborted) return;
        if (files.length) addTexts(files);
        setState({ status: "ready", sources: config.sources });
      } catch (error) {
        if (abort.signal.aborted) return;
        setState({
          status: "failed",
          sources: config.sources,
          error: `The reports could not be read from complydoc ui. ${error instanceof Error ? error.message : ""}`.trim(),
        });
      }
    })();
    return () => abort.abort();
  }, [config, addTexts]);

  return state;
}
