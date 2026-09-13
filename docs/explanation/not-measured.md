# Not measured is not zero

A document with no text layer has no word count, not a word count of zero. A
reader that cannot detect tables reports no table count, not a count of zero.

Recording either as zero puts an unmeasured value into every average computed
from it, with nothing in the output to distinguish it from a measurement.

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

## Exception, since corrected

The entity detector previously reported `confidence: 1.0` for every name. The
spaCy pipeline in use exposes no per-entity score, so the value was a constant,
not a measurement, and it ranked model detections level with checksum-backed
ones.

It now reports `null`, and the [evidence tier](evidence.md) carries the
distinction instead.

## Limitations in the report

Each run generates a list of limitations from its own execution — components
that did not run, categories that could not be scanned, prices without a
verification date, sampling — and prints them on the report's first page with a
severity.
