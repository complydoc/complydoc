# Text for a pipeline

The audit says what a folder is like. This gives you its words, with the
identifiers covered over, ready to send somewhere else.

```python title="text_for_a_pipeline.py"
--8<-- "examples/text_for_a_pipeline.py"
```

```text
employee-record.pdf p1: 191 tokens (approximate)
   15 masked, 8 of them checksum-backed
financial-summary.pdf p1: 74 tokens (approximate)
   0 masked, 0 of them checksum-backed

  [unreadable_page] invoice-scan.pdf p1: nothing could be read off this page; OCR was not run
  [masking_best_effort] run: organisation name, person name are recognised by a statistical
  model rather than by a rule, so some will have been missed. The text is much safer than
  the original and is not certified free of them
```

## Read the warnings

Each is something you would otherwise find out later and worse.

| Warning | Means |
| --- | --- |
| `masking_best_effort` | Raised every time masking runs. Names have no checksum, so a model finds them and models miss |
| `masking_incomplete` | A category could not be scanned at all — none of that kind were covered, anywhere |
| `unreadable_page` | Nothing could be read off a page. Usually a scan with `ocr=False` |
| `unreadable_document` | A file would not open. None of its content is here |
| `estimated_tokens` | No local encoding, so counts are a character estimate |

!!! warning "Masked is not certified clean"

    On the sample document, the model finds `John Smith` and misses `Jane Doe`
    on the line above it.

    `chunk.masked` counts what was covered. `chunk.masked_confirmed` counts how
    many of those passed a checksum. The difference is the part resting on a
    model's judgement — and that is the part that will miss.

## Chunks

A chunk is a page, unless you set `max_tokens`. Then a page over budget is split
at paragraph breaks, and a single paragraph longer than the budget goes through
whole rather than being cut mid-sentence.

`chunk.token_fidelity` is `exact` from the model's own encoding, `approximate`
from another provider's, `estimated` from dividing by four. A number you can
budget against should not look like one you can't.

## It does not read the report

A report truncates pages at 20,000 characters, because a person is going to read
it. Dropping the end of a contract silently would be indefensible here, so this
loads and scans documents directly and the text comes back whole.

## Your own reader

If complydoc does not handle your format, teach it:

```python title="bring_your_own_loader.py"
--8<-- "examples/bring_your_own_loader.py"
```

Everything downstream then treats it as a document complydoc always knew about —
the scan, the masking, the signals, the report. `register_extractor` does the
same for a library that reads a PDF's text layer, `register_engine` for OCR.
