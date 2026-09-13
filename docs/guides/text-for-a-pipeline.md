# Text for a pipeline

`extract_text` returns a folder's text with detected identifiers replaced by
mask characters, split into chunks, each with a token count.

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
  model rather than by a rule, so some will have been missed. The text is much safer
  than the original and is not certified free of them
```

## Warnings

`result.warnings` is a list of `ExtractionWarning`. Five kinds:

| Warning | Means |
| --- | --- |
| `masking_best_effort` | Raised every time masking runs. Names have no checksum, so a model finds them and models miss |
| `masking_incomplete` | A category could not be scanned at all — none of that kind were covered, anywhere |
| `unreadable_page` | Nothing could be read off a page. Usually a scan with `ocr=False` |
| `unreadable_document` | A file would not open. None of its content is here |
| `estimated_tokens` | No local encoding, so counts are a character estimate |

!!! warning "Masking is best effort"

    Categories detected by the statistical model will be missed at some rate.
    On the shipped sample the model finds `John Smith` and does not find
    `Jane Doe` on the preceding line.

    `chunk.masked` counts replacements. `chunk.masked_confirmed` counts the
    subset that passed a checksum. The difference is the model-detected part.

## Chunks

One chunk per page, unless `max_tokens` is set. A page over the budget is split
at paragraph breaks; a single paragraph exceeding the budget is emitted whole
rather than split mid-sentence.

`chunk.token_fidelity` is `exact` when the count came from the model's own
encoding, `approximate` from another provider's encoding, and `estimated` when
no encoding was available and the count is characters divided by four.

## Text is not taken from the report

The report truncates page text at 20,000 characters. `extract_text` loads and
scans documents directly, so the text it returns is not truncated.

## Registering a loader

For a format complydoc does not handle:

```python title="bring_your_own_loader.py"
--8<-- "examples/bring_your_own_loader.py"
```

Discovery, the scan, masking, the signals and the report then treat it as any
other document. `register_extractor` registers a reader for a PDF text layer;
`register_engine` registers an OCR engine.
