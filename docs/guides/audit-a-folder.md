# Audit a folder

```bash
complydoc audit ~/contracts
```

Reads every document in the folder, writes an HTML report and a JSON file
beside it, and prints a summary.

`--ocr` recognises pages with no text layer. Without it such a page contributes
no text, and the run reports it as unread.

## What the report holds

The report is meant to be shared, so it carries no identifier in the clear:

- **Findings** show each value masked to its last few characters.
- **Page text** is kept, so a reading can be checked against the page, with every
  identifier that was found replaced by its masked form. `--no-extracted-text`
  leaves the text out altogether.
- **Pages** are drawn as wireframes: where the text, images and findings sit,
  without the content.

Masking is only as complete as detection: a name the model did not recognise is
still in the page text.

Two flags change that, and both are announced when the run starts and recorded
as an important limitation in the report:

| Flag | Adds |
| --- | --- |
| `--page-images` | A picture of each page. A picture shows every value on it, masked or not |
| `--reveal` | Every value unmasked, in the findings, the page text and `--save-text` files |

## How much the JSON carries

The JSON is written in one of two shapes, and `run.report_detail` says which:

| `--detail` | Carries | 200 one-page documents |
| --- | --- | --- |
| `summary` (default) | Every finding, score and limitation, and the folder's cost on each model | 4.6 MB |
| `full` | All of that, plus the price of every document on every model, and the page geometry the HTML draws with | 20.3 MB |

The HTML report is the same either way: it is drawn before the JSON is written.
Use `--detail full` on `audit` or `cost` when you need a single document's price on a
given model, or when something reprocesses the reports, since a summary reads back
without the parts it left out. In Python, `cd.write_json(report, path, detail="full")`.

## Report summary

**Readiness** (global readiness in the report) is one number for *can these documents go through a
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

`complydoc compare-readers ~/contracts` uses every reader and OCR engine you have
installed.

## Large folders and sampling

`--jobs 0` picks a worker count from the size of the folder.

`--sample 200` audits a subset that keeps each file type's share. The choice is
deterministic, so two runs of one folder pick the same documents and their
reports compare — and the front page says it read a sample.
