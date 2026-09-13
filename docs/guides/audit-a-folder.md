# Audit a folder

```bash
complydoc audit ~/contracts
```

Reads every document, writes an HTML report and a JSON file beside it, prints a
summary. Nothing leaves the machine.

Add `--ocr` if the folder holds scans. It is slower, and without it a scanned
page contributes nothing — which the report says rather than passing over.

## Reading the front page

**Global readiness** is one number for *can these documents go through a
pipeline at all*, from three factors, with the weights printed beside them:

| Factor | Asks |
| --- | --- |
| Content | Can the text be got off the page |
| Cost path | Does the document force the expensive path — an image rather than text |
| Exposure | What it carries that should not leave |

The ring beside it shows **composition, not the score**. A folder averaging 71
can still hold two documents nothing can be read from, and those two are the
ones somebody has to deal with.

**Quick wins** are what to do next, ranked by how much of the folder each
touches. Each says who acts — `complydoc` where the tool can do it, `you` where
it can't — and quotes the saving where it follows from prices already in the
report.

None of them predicts a score. Signals interact, and the honest way to find out
is to fix the documents and run it again.

## From Python

```python title="audit_a_folder.py"
--8<-- "examples/audit_a_folder.py"
```

## When the extraction looks wrong

Libraries read the same PDF differently, and the default is not always right:

```bash
complydoc audit ~/contracts --compare-extractor pypdf
```

Only the first reader reaches a finding. The rest are measured and never
adopted, and the report marks the pages where they disagreed, with each
reader's text and the differences highlighted.

The case worth catching does not change the size of the text. On a two-column
page, pdfplumber walks the text layer in file order — straight across both
columns, interleaving every sentence — and returns the same character count as
the readers that get it right. The report calls that `same words, different
order`.

`complydoc compare ~/contracts` uses every reader and OCR engine you have
installed.

## Large folders

`--jobs 0` picks a worker count from the size of the folder.

`--sample 200` audits a subset that keeps each file type's share. The choice is
deterministic, so two runs of one folder pick the same documents and their
reports compare — and the front page says it read a sample.
