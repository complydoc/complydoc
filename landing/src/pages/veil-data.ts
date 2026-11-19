/** What the Veil page says, kept apart from how it lays it out. */

/** Values from the same contract, and what Veil Judge makes of each. */
export const DECISIONS: { value: string; why: string; person: boolean }[] = [
  { value: "Maria Inês Carvalho", why: "Signs as the tenant", person: true },
  { value: "Lusitânia Imobiliária, Lda.", why: "The landlord, a company", person: false },
  { value: "NIF 234 567 891", why: "A personal tax number", person: true },
  { value: "NIPC 512 345 678", why: "A company number, starts with 5", person: false },
  { value: "PT50 0035 … 8901 2", why: "The tenant's own account", person: true },
  { value: "Rua Augusta 14, Lisboa", why: "The company's registered office", person: false },
];

/** Where a model sits in the family, out of three, against the others: not a benchmark. */
export type Level = 1 | 2 | 3;

export const FAMILY: {
  name: string;
  line: string;
  coverage: Level;
  speed: Level;
  runs: string;
  languages: string;
}[] = [
  {
    name: "Veil 1",
    line: "The general model, for documents in European languages.",
    coverage: 3,
    speed: 2,
    runs: "A server with a GPU",
    languages: "Multilingual",
  },
  {
    name: "Veil 1 Mini",
    line: "A smaller model that runs offline on a laptop's processor.",
    coverage: 2,
    speed: 3,
    runs: "Any computer, CPU only",
    languages: "Multilingual",
  },
  {
    name: "Veil 1 PT",
    line: "Trained further on one country's identifiers, addresses and names.",
    coverage: 3,
    speed: 3,
    runs: "A laptop or a server",
    languages: "One country each",
  },
];

export const COUNTRIES = ["PT", "ES", "DE", "FR", "IT"];

/** What a person's identifier looks like in each country Veil is tuned for. */
export const IDENTIFIERS: Record<string, string> = {
  PT: "NIF 234 567 891",
  ES: "DNI 12345678Z",
  DE: "Steuer-ID 65 929 970 489",
  FR: "NIR 2 88 03 75 116 042 31",
  IT: "CF RSSMRA88C54H501U",
};

/** The model card: what Veil is, plainly. */
export const CARD: { term: string; detail: string }[] = [
  { term: "Task", detail: "Find personal data in documents and decide whose it is." },
  { term: "Input", detail: "Text from any loader complydoc supports: PDF, Word, spreadsheets, scans after OCR." },
  {
    term: "Output",
    detail: "Each value with its kind, its position on the page, and a decision: person or company.",
  },
  { term: "Runs", detail: "On your own machine. Documents are not sent anywhere to be checked." },
  {
    term: "Trained on",
    detail: "Synthetic documents across 15 kinds of paperwork and 9 countries. Real documents come next.",
  },
  {
    term: "Limits",
    detail:
      "Strong on synthetic documents, not yet on real ones. Until it is, complydoc keeps its current rules and spaCy models.",
  },
  { term: "Status", detail: "In training. Teams can ask to try it on their own documents." },
];

