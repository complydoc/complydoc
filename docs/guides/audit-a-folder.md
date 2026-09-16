# Audit a folder

```bash
complydoc audit ~/contracts
```

Reads every document in the folder, writes an HTML report and a JSON file
beside it, and prints a summary.

`--ocr` recognises pages with no text layer. Without it such a page contributes
no text, and the run reports it as unread.

## Report summary

**Global readiness** is one number for *can these documents go through a
pipeline at all*, from three factors, with the weights printed beside them:

| Factor | Asks |
| --- | --- |
| Content | Can the text be got off the page |
| Cost path | Whether pages have to be sent as images |
| Exposure | What it carries that should not leave |

A factor the run did not measure is excluded and the remaining weights are
renormalised. The ring shows how many documents fall in each band.

**Quick wins** lists remediable findings, ordered by the number of documents
affected. Each carries an `actor` of `complydoc` or `you`, and a saving where
one follows from prices in the same report. No entry predicts a resulting
score.

## From Python

```python title="audit_a_folder.py"
--8<-- "examples/audit_a_folder.py"
```

## Comparing readers

Libraries read the same PDF differently, and the default is not always right:

```bash
complydoc audit ~/contracts --compare-extractor pypdf
```

Findings come from the first reader only. The others are measured and reported;
the page viewer shows each reader's text with the differences marked.

Readings are compared by word order. On a two-column page
pdfplumber walks the text layer in file order, crossing both columns, and
returns the same character count as a reader that follows the columns. The
report labels this `same words, different order`.

## Documents that never finish

A parser can hang on a malformed file. `--timeout` gives each document a number of
seconds and stops the ones that pass it:

```bash
complydoc audit ~/contracts --timeout 120
```

A stopped document is listed as skipped with the reason `timed out`, and the report
states how many were stopped and after how long. Reading happens in a worker process
whenever a timeout is set, because that is the only way to stop a parser that has
stopped responding. Without `--timeout` there is no limit.

`complydoc compare ~/contracts` uses every reader and OCR engine you have
installed.

## Large folders and sampling

`--jobs 0` picks a worker count from the size of the folder.

`--sample 200` audits a subset that keeps each file type's share. The choice is
deterministic, so two runs of one folder pick the same documents and their
reports compare — and the front page says it read a sample.
