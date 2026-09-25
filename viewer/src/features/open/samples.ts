/** The reports bundled with the viewer, loaded only when opened. */
export interface Sample {
  id: string;
  label: string;
  load: () => Promise<string>;
}

export const SAMPLES: readonly Sample[] = [
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
