# Text for a pipeline

The audit says what a folder is like. This is the other direction: the folder's
own words, with the identifiers covered over, ready to send somewhere else.

```python title="text_for_a_pipeline.py"
--8<-- "examples/text_for_a_pipeline.py"
```

## Read the warnings

They are the design, not decoration. Each one is a thing you would otherwise
discover later and worse.

| Warning | What it means |
| --- | --- |
| `masking_best_effort` | Raised **every time** masking runs. Names and organisations have no checksum to pass, so a model finds them, and models miss |
| `masking_incomplete` | A category could not be scanned at all — so none of that kind were covered anywhere |
| `unreadable_page` | Nothing could be read off a page. Usually a scan with `ocr=False` |
| `unreadable_document` | A file would not open. None of its content is in the result |
| `estimated_tokens` | No local encoding was available, so counts are a character estimate |

!!! warning "Masked is not certified clean"

    On the sample document that ships with the tool, the model finds
    `John Smith` and misses `Jane Doe` on the line above it. `chunk.masked` is
    how many identifiers were covered; `chunk.masked_confirmed` is how many of
    those passed a checksum. The difference is the part resting on a model's
    judgement.

    If a wrong answer is expensive, check `result.all_categories_scanned` first
    and treat the model-backed categories as advisory.

## Chunks

A chunk is a page unless `max_tokens` is set, in which case a page over budget
is split at paragraph breaks — and a single paragraph longer than the budget is
passed through whole rather than cut mid-sentence.

Every chunk carries `token_fidelity`: `exact` from the model's own encoding,
`approximate` from another provider's, `estimated` from dividing by four. A
number you can budget against and a number you cannot should not look the same.

## It does not go through the report

A report truncates pages at twenty thousand characters, because a person is
going to read it. Dropping the end of a contract silently would be
indefensible here, so `extract_text` loads and scans documents directly and the
text comes back whole.

## Bringing your own reader

If complydoc does not handle your format, teach it:

```python title="bring_your_own_loader.py"
--8<-- "examples/bring_your_own_loader.py"
```

Everything downstream then treats it as a document complydoc always knew about —
the scan, the masking, the signals, the report. `register_extractor` does the
same for a library that reads a PDF's text layer, and `register_engine` for an
OCR engine.
