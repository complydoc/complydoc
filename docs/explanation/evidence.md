# How sure a finding is

Every sensitive finding carries an evidence tier. Not a probability — the
detectors do not produce comparable ones, and a number would claim a precision
nobody has.

| Tier | What was established |
| --- | --- |
| `confirmed` | A checksum passed. A card number satisfying Luhn is a card number |
| `corroborated` | The shape matched and a label sits beside it — "IBAN:", "Sort code" |
| `pattern` | The shape matched and nothing else confirms it. Nine digits are nine digits |
| `model` | A statistical model named it. The strongest evidence available for a name, and the weakest here |

The tier is **earned, not declared**: it is derived from what actually happened
to a finding — which validators passed, whether a context term was nearby, which
detector produced it — so a detector cannot claim more for its findings than the
checks they survived.

## What it changes

The security table sorts on it within a severity, so a confirmed card number
appears above a name a model thought it saw. The two are not equally worth an
afternoon.

In [extracted text](../guides/text-for-a-pipeline.md), `chunk.masked_confirmed`
counts the masks that passed a checksum. The difference from `chunk.masked` is
the part of the masking resting on judgement, which is the part that will miss.

It also decides who wins when findings collide. Detectors are independent, so a
card number and a name can claim the same characters — on a line reading
`Card 4111 1111 1111 1111` the model calls `Card 4111` an organisation. Masking
applies the best-evidenced match first and never writes where something is
already masked, because doing it in reading order once let the weaker overwrite
the stronger and put four digits of a card number back in the clear.

## Why there are twenty checksums

Because `confirmed` is worth a great deal more than `pattern`, and most
identifiers can be confirmed: Luhn for cards, mod-97 for IBAN and VAT, and
national schemes for the UK, US, Ireland, the Netherlands, Portugal, Spain,
France and Germany. A checksum turns a guess into near-certainty for the cost of
a few lines of arithmetic, and it is the difference between a finding somebody
acts on and one they dismiss.

Names and organisations have no checksum, which is why they sit in `model` and
why everything that touches them says so.
