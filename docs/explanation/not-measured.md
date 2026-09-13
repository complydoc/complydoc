# Not measured is not zero

If a document has no text layer, the number of words on its pages is not zero.
Nobody looked. If a reader cannot find tables, the table count is not zero — it
has no way to find one.

Report either as zero and you get a folder average that is confidently wrong,
and a reader with no way to tell.

So every measurement can say it was not taken:

- A **signal** that could not be measured is reported as not applicable, with
  what stopped it, and stays out of the score. The weights are renormalised over
  the signals that did produce a rating, so a document where six do not apply is
  not penalised for six missing contributions.
- A **readiness factor** the run did not measure is dropped the same way.
  `complydoc readiness` alone still gives you a score; it just says it came from
  one factor instead of three.
- **Coverage** from a reader that returns no geometry is `null`, not 0%. Nought
  per cent would read as a blank page, which is the opposite of what happened.
- A **token count** with no local encoding is marked `estimated`, because
  dividing by four is not measuring.

## The one place this was violated

The entity model used to report a confidence of `1.0` on every name it found.
spaCy's small English pipeline exposes no per-entity score, so that number was a
placeholder wearing the clothes of a measurement — and it put a model's guess
level with a checksum that passed.

It reports `null` now. The [evidence tier](evidence.md) says what a finding
actually rests on instead.

## Why this matters more than accuracy

A number that is wrong in a knowable direction is recoverable. A number that is
wrong while looking exactly like a measured one is not.

Every limitation a run could not overcome is generated from the run itself and
printed on the front page, so the report argues against its own conclusions
where it should.
