# How sure a finding is

Every sensitive finding carries an evidence tier rather than a probability. The
detectors do not produce comparable numbers, and inventing one would claim a
precision nobody has.

| Tier | What was established |
| --- | --- |
| `confirmed` | A checksum passed. A card number satisfying Luhn is a card number |
| `corroborated` | The shape matched and a label sits beside it — "IBAN:", "Sort code" |
| `pattern` | The shape matched and nothing else confirms it. Nine digits are nine digits |
| `model` | A statistical model named it. The strongest evidence available for a name, and the weakest here |

The tier is **earned, not declared**. It comes from what happened to the
finding — which validators passed, whether a label sat nearby, which detector
produced it — so a detector cannot claim more than its findings survived.

## What it changes

The security table sorts on it within a severity, so a confirmed card number
appears above a name a model thought it saw. They are not equally worth an
afternoon.

In [extracted text](../guides/text-for-a-pipeline.md), `chunk.masked_confirmed`
counts the masks that passed a checksum. The difference from `chunk.masked` is
the part of the masking resting on judgement, which is the part that will miss.

It also settles collisions. Detectors are independent, so a card number and a
name can claim the same characters: on a line reading `Card 4111 1111 1111
1111`, the model calls `Card 4111` an organisation.

Masking applies the best-evidenced match first and never writes where something
is already masked. Doing it in reading order once let the weaker overwrite the
stronger and put four digits of a card number back in the clear.

## Why there are twenty checksums

Because `confirmed` is worth far more than `pattern`, and most identifiers can
be confirmed: Luhn for cards, mod-97 for IBAN and VAT, national schemes for the
UK, US, Ireland, the Netherlands, Portugal, Spain, France and Germany.

A few lines of arithmetic turn a guess into near-certainty. That is the
difference between a finding somebody acts on and one they dismiss.

Names and organisations have no checksum, which is why they sit in `model` and
why everything that touches them says so.
