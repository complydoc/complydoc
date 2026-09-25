/**
 * The reports bundled with the viewer, loaded only when opened.
 *
 * The build the Python package carries leaves them out (`VITE_SAMPLES=false`):
 * `complydoc ui` opens the user's own reports, and the audit sample alone is
 * several megabytes of page pictures.
 */
export interface Sample {
  id: string;
  label: string;
  load: () => Promise<string>;
}

export const SAMPLES: readonly Sample[] = import.meta.env.VITE_SAMPLES === "false" ? [] : [
  {
    id: "audit",
    label: "Audit with page images and OCR",
    load: async () => (await import("@/fixtures/audit.json?raw")).default,
  },
  {
    id: "share",
    label: "A shared drive, folders within folders",
    load: async () => (await import("@/fixtures/share.json?raw")).default,
  },
  {
    id: "loaders",
    label: "pypdf against pdfplumber",
    load: async () => (await import("@/fixtures/loaders.json?raw")).default,
  },
];
