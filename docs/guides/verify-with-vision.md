# Verifying pages with a vision model

A text layer can look complete and still be missing things: a line drawn as
vector shapes, a stamp, a table whose cells a reader skipped. `--verify` reads
pages again from their images, with a vision model of your own, and says where
that reading has words the kept one does not.

```bash
complydoc audit contract.pdf --verify vision:mymodels:claude --verify-scope all
```

```
80 of 80 pages checked against an independent vision read: 3 disagree ($1.4000, from the provider's token counts)
  contract.pdf: pages 12, 47, 61
```

## Bring your own model

complydoc runs no model and holds no key. `vision:module:function` names code of
yours, the same shape as `--classifier module:function`: the function is imported
and called with no arguments, and returns the model. The model is called once
per page with a `VisionPage` and returns a `VisionReading`, or just the text.

```python title="mymodels.py"
import base64

import anthropic

import complydoc as cd


def claude():
    client = anthropic.Anthropic()

    def read(page: cd.VisionPage) -> cd.VisionReading:
        response = client.messages.create(
            model="claude-opus-5",
            max_tokens=4096,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {
                    "type": "base64",
                    "media_type": page.media_type,
                    "data": base64.b64encode(page.image).decode(),
                }},
                {"type": "text", "text": "Transcribe every word on this page."},
            ]}],
        )
        return cd.VisionReading(
            text=response.content[0].text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )

    read.model = "claude-opus-5"
    return read
```

The `model` attribute names the reading in the report (`vision:claude-opus-5`)
and is what it is priced as. From Python, pass the callable itself:

```python
report = cd.full_audit("contract.pdf", verify_with=claude(), verify_scope="all")
print(report.verification.headline)
```

A callable keeps the audit in one process. A `vision:module:function` spec
crosses into worker processes, so `--jobs` reads documents in parallel.
`cd.compare_loaders(..., verify_with=...)` and `complydoc compare-loaders
--verify` read the baseline loader's pages again, so the vision reading can be
put beside every loader's.

**The page images leave the machine.** They go wherever your code sends them.
The network guard lets those calls through, records every host, and is back in
place as they return; the report names the hosts in `run.content_sent_to` and in
its limitations, and a policy with `no_network` fails the run.

## Which pages

| `--verify-scope` | Pages read again |
| --- | --- |
| `flagged`, the default | Routing sent them to vision, they have no usable reading, or two readers disagreed about them |
| `all` | Every page |

`flagged` answers whether the pages that looked risky are right. It cannot
answer whether a page that looked fine was read wrongly anyway; `all` does, at
the price of a vision call per page, and the report says which was run.

## When a page disagrees

The two readings are compared word by word, ignoring case, punctuation and
order, because a vision model lays a page out its own way: a table as pipes, a
heading with a hash. A page disagrees when either:

- the kept reading holds less than `verify_min_coverage_pct` of the words the
  model read (90 by default), or
- the model read `verify_missing_words` or more words in a row that the kept
  reading lacks (4 by default), so one sentence missing from a long page is
  still caught.

Both are in `readiness.yaml` under `routing`. The report quotes what the kept
reading lacks, longest run first, masked like every other value.

A page with no usable reading at all takes the vision reading as its text, and
is scanned for identifiers like any other page. The report counts those pages
apart from the ones that were compared, and says their text rests on a model's
transcription.

## What each reading cost

Every reading of a page carries what it cost, in `extracted_text[].costs`:

| Basis | Meaning |
| --- | --- |
| `local` | Ran on this machine: a text-layer library or local OCR. Free, not $0 of a price |
| `actual` | The provider's token counts from the response, priced from `pricing.yaml` |
| `estimated` | Worked out from the page's size under the model's image formula |
| `unpriced` | No price known for it |

A parser preset with a price in `pricing.yaml` carries its per-page price. Each
page also carries `vision_estimate`: what the cheapest priced vision model would
cost for it, whether or not one read it. The viewer shows these beside each
reading in the page comparison, and the Documents table gains a vision column.
