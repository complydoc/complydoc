/** Your own things to look for, as the Settings page edits them. */

/** An id for a new concept, from its label: `Tariff engine ID` → `tariff_engine_id`. */
export function conceptId(label: string, taken: string[]): string {
  const base =
    label
      .normalize("NFKD")
      // Accents are dropped rather than turned into breaks: "Número" is `numero`.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(?=\d)/, "c_")
      .slice(0, 40) || "concept";
  let id = base;
  for (let n = 2; taken.includes(id); n += 1) id = `${base}_${n}`;
  return id;
}
