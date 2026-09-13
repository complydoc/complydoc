# Evidence tiers

Every sensitive finding carries an evidence tier. The detectors do not produce
comparable probabilities, so the field records what was established instead of a
score.

| Tier | What was established |
| --- | --- |
| `confirmed` | A checksum passed |
| `corroborated` | The pattern matched and a context term was within the configured window |
| `pattern` | The pattern matched; nothing else corroborates it |
| `model` | A statistical model produced it. No checksum exists for the category |

The tier is derived, not declared by the detector: it is computed from the
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

Most identifier formats carry one: Luhn for card numbers, mod-97 for IBAN and
VAT, and national schemes for the UK, US, Ireland, the Netherlands, Portugal,
Spain, France and Germany. A passing checksum moves a finding from `pattern` to
`confirmed`, which changes both its ranking and its weight in the exposure
score.

Names and organisations have no checksum, which is why they sit in `model` and
why everything that touches them says so.
