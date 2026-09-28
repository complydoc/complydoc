# The demo

A clean folder to show complydoc from, with every run the viewer shows already in it.

```bash
uv sync --group integrations
make viewer-bundle                       # only when running from this checkout
uv run --group integrations python demo/prepare.py
cd ~/complydoc-demo && complydoc ui
```

`prepare.py` empties `~/complydoc-demo` (only a folder it made) and writes:

| In the folder | What it shows |
| --- | --- |
| `contracts/` | Eight documents: six PDFs (an annual report with tables and a chart, a two-column services agreement, German invoices, scanned invoices, a handbook, a due diligence questionnaire), a CV in Word and an email |
| `pipeline.py` | The ingestion pipeline inside `cd.observe`, the file to show on screen |
| `.complydoc/contracts.json` | The audit: every PDF read a second way, page pictures, the text |
| `.complydoc/contracts-chunks.json` | Six splitters side by side |
| `.complydoc/contracts-ingest-*.json` | The pipeline twice: as it was, then with `MaskIdentifiers` |

Everything is synthetic, so it can be shown as it is. Two instructions to a model are
hidden in it: white text in the questionnaire and 2 pt white text in the CV. The
embedding model is a local stand-in named as OpenAI's; with `OPENAI_API_KEY` set and
`langchain-openai` installed, the pipeline calls the real one.

## A one-minute video

Recorded at 1440 × 900 in the dark theme (`?theme=dark`), bookmarks bar hidden. LinkedIn
plays videos muted, so each shot carries its line as a caption.

| Time | Screen | Caption |
| --- | --- | --- |
| 0:00 | Home of `contracts`: 20 high-severity identifiers, 2 hidden instructions | Your RAG is only as good as what you ingest. Do you know what is in it? |
| 0:05 | `pipeline.py`, the `with cd.observe(...)` line | One block around your ingestion pipeline. |
| 0:10 | Trace of the first `contracts-ingest` run: click through load, split, embed; stop on `OpenAIEmbeddings` | Every step: time, tokens, cost, and what it let through. |
| 0:22 | Runs, tick both, Compared: identifiers sent 33 → 0 | Add masking, and prove it worked. |
| 0:30 | Documents → `vendor-due-diligence.pdf`, open the hidden passage | Instructions hidden for your model, found before it reads them. |
| 0:40 | `master-services-agreement.pdf`, Diff (the readers agree on 34%) | Two loaders, two different documents. See where. |
| 0:48 | Chunks, then a document with a splitter's chunks drawn over it | Six splitters, side by side, on your own documents. |
| 0:54 | Terminal: `uv tool install complydoc` | The observability layer for AI ingestion pipelines. Open source, runs on your machine. |

Tips:
- Open each screen once before recording: the audit is 12 MB and loads in a second or two the first time.
- Recordly's automatic zoom follows the cursor, so move it slowly to what the caption names and hold it there.
- The viewer's loading screen shows the folder's full path, home folder included.
