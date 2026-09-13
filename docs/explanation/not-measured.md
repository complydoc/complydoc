# Not measured is not zero

The single idea the rest of the tool is built on.

If a document has no text layer, the number of words on its pages is not zero —
nobody looked. If a reader cannot find tables, the table count is not zero — it
has no way to find one. Reporting either as zero produces a folder average that
is confidently wrong, and a reader with no way to tell.

So every measurement can say it was not taken, with the reason:

- A **signal** that could not be measured is reported as not applicable, with
  what stopped it, and is **excluded from the score** rather than scored as
  nought. The weights are renormalised over the signals that did produce a
  rating, so a document where six signals do not apply is not penalised for six
  missing contributions.
- A **global readiness factor** the run did not measure is dropped the same way,
  and the report says how many of the three it was built from. `complydoc
  readiness` on its own still produces a score; it just says it came from one
  factor.
- A **coverage figure** from a reader that returns no geometry is `null`, not
  0%. Nought per cent coverage would read as a blank page, which is the opposite
  of what happened.
- A **token count** with no local encoding is marked `estimated`, because
  dividing by four is not measuring.

## The one place it was violated

The entity model used to report a confidence of `1.0` on every name it found.
spaCy's small English pipeline exposes no per-entity score, so that number was
a placeholder presented as a measurement — and it put a model's guess level
with a checksum that passed.

It now reports `null`. The [evidence tier](evidence.md) says what the finding
actually rests on instead.

## Why it matters more than accuracy

A diagnostic exists to be acted on. A number that is wrong in a knowable
direction is recoverable; a number that is wrong while looking exactly like a
measured one is not. Every limitation a run could not overcome is generated
from the run itself and printed on the front page, so the report argues against
its own conclusions where it should.
