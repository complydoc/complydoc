# Safe copies

A cleaned copy is the same document with every identifier complydoc found
replaced by its masked form, and the metadata the file carries removed. It is
for the case where a document has to reach a model, a vendor or a ticket, and
the values inside it should not.

```bash
complydoc clean ~/contracts --out clean/
complydoc clean invoice.pdf --out clean/ --rasterise
```

```python
import complydoc as cd

result = cd.clean_document("contract.docx", "clean/")
print(result.masked, "identifiers masked")
print(result.metadata_removed)
```

## What each format gets

| Format | Text | Metadata |
| --- | --- | --- |
| `.txt`, `.md` | masked in place | — |
| `.html` | masked in every text node; comments removed | — |
| `.eml` | masked in every text part, and in the address headers | — |
| `.docx` | masked in runs, tables, headers and footers | core properties and the thumbnail |
| `.xlsx` | masked in every string cell | core properties |
| `.pptx` | masked in slide and notes text | `docProps` parts |
| `.pdf` | see below | the document information dictionary |

## PDFs

Text in a PDF is drawn at coordinates rather than stored as a run of
characters, so there is nowhere to write a masked value back to without laying
the page out again. A PDF copy therefore has its metadata stripped and its text
left as it was, and the result says so.

`--rasterise` renders each page to an image and rebuilds the file from those.
No text layer survives, so nothing in the copy can be selected, searched or read
by a text extractor, and a model reading it needs OCR or vision.

Black rectangles are never drawn over words. A rectangle is painted above the
page and the characters stay in the content stream underneath it, where
selecting the area or opening the file with any library returns them in full.

## What a copy is worth

A copy masks what detection found, and detection is measured rather than
assumed: [Detection accuracy](../explanation/accuracy.md) gives the numbers,
including what it misses.

Two limits apply to every copy and are reported on the result:

- Each piece of text is masked on its own. An identifier written across two
  runs, two cells or two elements is not seen as one value by a scan of either.
- A category that could not be scanned at all masks nothing anywhere in the
  file. Running without a name model means no name was masked in any copy, and
  the run says which categories those were.

Attachments inside an `.eml` are copied unchanged. They are separate documents,
and a copy that quietly rewrote them would say nothing about what it changed;
save them and clean them on their own.
