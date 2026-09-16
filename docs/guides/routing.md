# Page routing

Sending every page to a vision model reads anything and costs the most. Reading
the text layer costs the least and returns nothing for a scan. Most folders are a
mix, and `complydoc routing` works out which pages need what:

```bash
complydoc routing ~/contracts --no-ocr
```

```
Route   Pages  Documents
text       13          9
ocr         1          1
vision      5          5

Every page                             Cost
by the route it needs               $0.0121
from its text layer                 $0.0043
text layer, scans through local OCR $0.0067
as an image to a vision model       $0.0398
```

It writes `complydoc-routing.json`, a manifest an ingestion job can read, and the
usual HTML report.

## How each page is decided

| Route | When |
| --- | --- |
| `text` | A usable text layer, and nothing on the page that plain text loses |
| `ocr` | No usable text layer, and a scan OCR can read |
| `vision` | Plain text would lose the page |

A page takes the vision route when it carries a table with merged or stacked
header cells, when it is mostly picture with a caption for a text layer, when it
is a scan too coarse for OCR, or when OCR read it poorly. Every page carries the
reason for its route, so a plan can be argued with.

The thresholds are in `readiness.yaml` under `routing`, and match the readiness
signals they come from:

```yaml
routing:
  min_characters: 40
  min_text_coverage_pct: 30
  picture_share_pct: 50
  min_ocr_dpi: 200
  min_ocr_confidence: 75
  vision_for_complex_tables: true
```

## The manifest

```json
{
  "model": "Claude Sonnet 5",
  "resolution": "medium",
  "counts": { "pages": { "text": 13, "ocr": 1, "vision": 5 } },
  "cost_usd": { "routed": 0.0121, "text_layer": 0.0043, "text_ocr": 0.0067, "vision": 0.0398 },
  "documents": [
    {
      "document": "vendor-assessment.pdf",
      "route": "vision",
      "pages": [
        { "page": 1, "route": "text", "reason": "a text layer covering 41% of the page", "characters": 1875 },
        { "page": 2, "route": "vision", "reason": "a table with merged or stacked header cells, which plain text loses", "characters": 640 }
      ]
    }
  ]
}
```

`--print-json` writes the same manifest to stdout and nothing else.

## From Python

```python
import complydoc as cd

report = cd.full_audit("./documents")
for document in report.documents:
    for page in document.routing.pages:
        print(document.relative_path, page.number, page.route, page.reason)

print(report.routing.routed_usd, report.routing.vision_usd)
```

`cd.full_audit` and `complydoc audit` compute routes too; the routing command
exists to write the manifest and to price the mix on its own.

## What the prices mean

The four figures use the model the report quotes and the folder's own pages.
Pages routed to the text layer or to OCR are priced on the document's text
tokens, shared between its pages by how many characters each holds, because a
run does not count the tokens of a page separately. Pages routed to vision are
priced as rendered images at the report's resolution.

A document that opens with no pages, such as an encrypted PDF, takes no route,
and the summary counts those separately rather than leaving them out.
