/**
 * How one identifier was validated, as steps a reader can follow.
 *
 * The grade says how sure complydoc is; these say why, from what the report
 * recorded about the match: the checks its value passed, a label found beside
 * it, and the name model's own score.
 */
import type { SensitiveMatch } from "./types";

/** What each check complydoc runs proves, for the ones a reader is likely to meet. */
const CHECKS: Record<string, string> = {
  luhn: "Luhn checksum, the check digit every payment card carries",
  card_issuer: "number range of a real card issuer",
  iban_mod97: "IBAN mod-97 checksum",
  vat_mod97: "VAT number mod-97 checksum",
  ni_prefix: "a prefix HMRC issues for National Insurance numbers",
  sort_code: "the shape of a UK sort code",
  uk_postcode: "a real UK postcode area",
  plausible_dob: "a plausible date of birth",
  e164_phone: "an international phone number plan",
  nanp_phone: "the North American numbering plan",
  uk_phone: "the UK numbering plan",
  aba_routing: "ABA routing number checksum",
  us_ssn: "the rules for US Social Security numbers",
};

function check(id: string): string {
  if (CHECKS[id]) return CHECKS[id];
  // Country checks are named `<country>_<scheme>`: "pt_nif" is the Portuguese NIF check digit.
  const [country, ...scheme] = id.split("_");
  return scheme.length > 0 && country?.length === 2
    ? `${scheme.join(" ").toUpperCase()} check digit (${country.toUpperCase()})`
    : id.replaceAll("_", " ");
}

export function validationSteps(match: SensitiveMatch): string[] {
  const steps = ["Its shape matches the pattern for this kind of identifier."];
  for (const id of match.validators_passed ?? []) steps.push(`Passed: ${check(id)}.`);
  if (match.context_term) steps.push(`Found beside the label “${match.context_term}”.`);
  if (typeof match.confidence === "number" && match.evidence === "model") {
    steps[0] = "A name model read it as this kind of name.";
    steps.push(`The model's score was ${Math.round(match.confidence * 100)}%.`);
  }
  return steps;
}
