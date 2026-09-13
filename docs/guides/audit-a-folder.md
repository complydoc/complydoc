# Audit a folder

```bash
complydoc audit ~/contracts
```

That reads every document in the folder, writes an HTML report and a JSON file
beside it, and prints a summary. Nothing leaves the machine.

Add `--ocr` if the folder holds scans. It is slower, and without it a scanned
page contributes nothing — which the report says rather than passing over.

## What the front page tells you

**Global readiness** is one number for "can these documents go through a
pipeline at all", built from three factors with the weights printed beside them:

| Factor | Asks |
| --- | --- |
| Content | Can the text be got off the page at all |
| Cost path | Does the document force the expensive path — an image rather than text |
| Exposure | What it carries that should not leave, weighted by severity and evidence |

A factor the run did not measure is dropped and the rest renormalised, never
counted as nought, and the ring says how many of the three it was built from.

The ring itself shows **composition, not the score**. A folder averaging 71 can
still hold two documents nothing can be read from, and those two are the ones
somebody has to deal with.

**Quick wins** are ranked by how much of the folder each touches. Each says who
has to act — `complydoc` where the tool could do it, `you` where it cannot — and
where the consequence follows from prices already in the report, it is computed
rather than guessed. None of them predicts a score, because signals interact and
the honest way to know is to fix the documents and run it again.

## From Python

```python title="audit_a_folder.py"
--8<-- "examples/audit_a_folder.py"
```

## When extraction looks wrong

Different libraries read the same PDF differently, and the default is not always
right. Compare them in one run:

```bash
complydoc audit ~/contracts --compare-extractor pypdf
```

Only the first reaches a finding; the rest are measured and never adopted. The
report marks the pages where they parted company and shows each reader's text
with the differences highlighted, so you can see which got it right.

The case worth catching does not change the size of the text. On a two-column
page, pdfplumber walks the text layer in file order — across both columns,
interleaving every sentence — and returns the same number of characters as the
readers that get it right. The report says `same words, different order` when
that happens.

`complydoc compare ~/contracts` uses every reader and OCR engine installed.

## Auditing a large folder

`--jobs 0` reads the folder and picks a worker count. `--sample 200` audits a
deterministic, type-proportional subset — two runs of the same folder pick the
same documents, so their reports compare — and the report says on its front page
that it read a sample.
