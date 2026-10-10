# Page routing

Sending every page to a vision model reads anything and costs the most. Reading
the text layer costs the least and returns nothing for a scan. Most folders are a
mix, and `complydoc routing` works out which pages need what:

```bash
complydoc routing ~/contracts --no-ocr
```

```
Route   Pages  Documents
text        7          7
ocr         0          0
vision      3          3

Every page                              Cost
by the route it needs                $0.0115
from its text layer                  $0.0022
text layer, scans through local OCR  $0.0022
as an image to a vision model        $0.0320
```

It writes `complydoc-routing.json`, a manifest an ingestion job can read, and
`complydoc-routing-report.json`, the run as a report, which `complydoc ui` opens.

## How each page is decided

With a vision model available, which is the default:

| Route | When |
| --- | --- |
| `text` | A usable text layer, and nothing on the page that plain text loses |
| `vision` | No usable text layer, or plain text would lose the page |

A page with a text layer takes the vision route when the layer is not text (a
font that does not map to characters, or an embedded OCR layer that read noise;
pages of figures and text in any script count as text),
when it carries a table with merged or stacked header cells, or when it is mostly
picture with a caption for a text layer. A page with no text layer always takes
it. Every page carries the reason for its route, so a plan can be argued with.

Without a vision model, set `vision: false` and routing uses only what costs
nothing:

| Route | When |
| --- | --- |
| `text` | A text layer, whatever its state |
| `ocr` | No usable text layer |

Where OCR will read a page poorly, a coarse scan or one it read with low
confidence, the plan says a vision model would read it better.

These rules are the ones that kept the most on two public parsing benchmarks,
measured page by page against the cheapest reader that loses nothing. Two findings
shaped them. On pages with no text layer, local OCR kept far less than a vision
model. And a poor text layer still kept more than OCR, which is why the free plan
reads it.

The thresholds are in `readiness.yaml` under `routing`:

```yaml
routing:
  vision: true
  min_characters: 40
  min_text_coverage_pct: 30
  picture_share_pct: 50
  max_control_char_pct: 2
  min_wordlike_pct: 50
  vision_for_complex_tables: true
```

## The manifest

```json
{
  "model": "Claude Sonnet 5",
  "resolution": "medium",
  "counts": { "pages": { "text": 7, "ocr": 0, "vision": 3 } },
  "cost_usd": { "routed": 0.0115, "text_layer": 0.0022, "text_ocr": 0.0022, "vision": 0.0320 },
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
