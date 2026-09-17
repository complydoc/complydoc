# Evidence tiers

Every sensitive finding carries an evidence tier. The detectors do not produce
comparable probabilities, so the field records what was established instead of a
score.

| Tier | What was established |
| --- | --- |
| `confirmed` | A check digit passed |
| `corroborated` | The pattern matched and a context term was within the configured window |
| `pattern` | The pattern matched; nothing else corroborates it |
| `model` | A statistical model produced it. No checksum exists for the category |

The tier is computed from the
validators that passed, the presence of a context term, and the detector in use.
A detector cannot assign its own findings a higher tier than the checks they
passed.

## Effects

The security table sorts on it within a severity, so checksum-backed findings
precede model detections of the same severity.

In [extracted text](../guides/extract-masked-text.md), `chunk.masked_confirmed`
counts the masks that passed a checksum. The difference from `chunk.masked` is
the part of the masking resting on judgement, which is the part that will miss.

It also settles collisions. Detectors are independent, so a card number and a
name can claim the same characters: on a line reading `Card 4111 1111 1111
1111`, the model calls `Card 4111` an organisation.

Masking applies the best-evidenced match first and never writes where something
is already masked. Doing it in reading order once let the weaker overwrite the
stronger and put four digits of a card number back in the clear.

## Validators

Most identifier formats carry one: Luhn plus the issuing network's prefix and
length for card numbers, mod-97 for IBAN and
VAT, and national schemes for the UK, US, Canada, Brazil, Ireland, the
Netherlands, Belgium, Portugal, Spain, France, Germany, Italy, Switzerland,
Poland, Sweden, India and Australia. The full list is in the
[identifier reference](../reference/identifiers.md). A passing checksum moves a finding from `pattern` to
`confirmed`, which changes both its ranking and its weight in the exposure
score.

Five validators check a shape instead: `sort_code`, `uk_postcode`, `uk_phone`,
`plausible_dob` and `in_pan`. Six digits that are not all the same is what a sort
code looks like, and a plausible date of birth is any date someone alive could
have, which every contract date also is. A finding resting on one of those is
`corroborated` where its label sits beside it and `pattern` where it does not,
because no checksum exists for it to have passed.

Names and organisations have no checksum, so their findings are always `model`.
