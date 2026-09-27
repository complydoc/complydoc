# The report viewer

`complydoc ui` opens the report viewer on the reports in a folder, served from
this machine:

```bash
complydoc audit ./documents
complydoc ui
```

```
2 reports in .complydoc
Viewer  http://127.0.0.1:8500/  Ctrl+C stops it
```

It lists every audit report it finds under `.complydoc`, where an audit writes
when no `--out` is given, grouped by the folder each one audited, newest run
first. Two runs of the same folder show what changed between them. A report
written while the viewer runs appears when the page is reloaded.

Name report files or other folders to open those instead:

```bash
complydoc ui reports/ baseline.json
```

| Option | Default | What it does |
| --- | --- | --- |
| `--port`, `-p` | 8500 | The port to serve on. The next free one is used when it is taken |
| `--no-browser` | | Print the address without opening the browser |

## What the viewer shows

The report every run writes: a Home page, every finding linked to where it
sits, and the cost of each model under a loading plan.

Every run opens on the same pages, whichever command wrote it:

| Page | Holds | Written by |
| --- | --- | --- |
| Home | The headline figures, the findings and documents to look at first | every run |
| Security | Identifiers and hidden instructions, per document and page | `audit`, `sensitive` |
| Cost & time | Each model's price for the folder, and reading time | `audit`, `cost` |
| Documents | Each document's pages, text and readings | every run that reads documents |
| Loaders | Loaders side by side, per file type | `compare-loaders` |
| Chunks | How each text splitter cut the text | `chunks` |

### How pages are read

The top bar sets how every cost and time in the report is worked out:

| Method | Reads each page |
| --- | --- |
| Loader | From the file's own text. Scanned pages stay unread |
| Loader + OCR on scans | From the file's own text, and by OCR where a page has none |
| OCR on every page | By OCR from its picture (shown when the run compared OCR) |
| Vision on every page | As an image sent to the vision model |
| complydoc router | The cheapest way that reads it well, page by page (recommended, shown when the run routed pages) |

A file with no page picture, such as a spreadsheet, a Word file or an email, has
nothing to recognise or show a vision model, so OCR and vision read it with its
loader. Each file type has its own loader: pypdf or pdfplumber for PDF,
python-docx for Word, openpyxl for Excel, and so on. Where a run read a file type
more than one way, a picker beside the method chooses which loader's text is priced,
and Cost & time adds a row for each other loader so they can be weighed side by side.
The choice is kept in the browser.

A page the run did not produce says so and what it would hold. Where another run
of the folder has it, the page offers to open that run; otherwise it gives the
command that fills it for the same folder, with a button to copy it. The sidebar
dims such pages. Home does the same card by card, so a `complydoc cost` run shows
its prices and says the identifier scan was not part of it.

Home leads with what the run could not do or vouch for: the important limitations,
each linking the documents it applies to, before the findings. The rest, on how
the figures were got, fold away at the foot of the page. The Security page says
which identifier categories nothing was looked for, and why.

A document read more than one way opens as a diff of two readers' text: the kept
reading against another library, OCR or a vision model. A document read one way
shows each page's text. Each page's first line says what it costs to read.

What was found is underlined in the text itself: red for high severity, amber
for medium, dotted for low. A rail at the text's edge has a tick where each
finding sits in the whole document; click one to go there. Rest the pointer on
an underlined value to see what it is and how sure complydoc is, and tick it off
as not a problem. Under `complydoc ui` the tick is saved to the audited folder's
ignore file; otherwise it lasts while the page is open. Ignored findings leave
the text, and the Security page lists them.

Where the folder has a `complydoc chunks` run, the document view can draw a
splitter's chunks over the text: pick the splitter beside the page stepper. Chunks
alternate in colour so each boundary shows, and those cut mid-sentence, mid-table
or on a heading are in amber, with a count above the text. Chunks are drawn only
on pages whose text is the one they were cut from, the same length as the text
the splitter was given, so a page read by another reader shows none rather than
wrong ones.

To the left of the text is the page's picture, when the report has one. Put it
away to give the text the whole width.

Page pictures need a report written with them:

```bash
complydoc audit ./documents --page-images
```

The text is masked, as the report is. A report written with `--reveal` holds the
values as well as a masked copy of every page. The viewer opens it masked, and
the eye button shows the values until you mask them again. On any other report,
the button is disabled.

## Runs of a folder

Every report of the same folder is one of its runs, whichever command wrote it.
The folder switcher at the top of the sidebar names each by its kind (Audit, Cost,
Loader comparison, Chunks and so on) and when it started, and opens any of them.
The Runs page lists every run of the folder, newest first, with what each measured:
documents, identifiers, hidden passages, readiness, cost and time, and what set it
apart, such as values revealed or page pictures. It draws how identifiers and
readiness moved across the folder's audits. Click a run to open it; tick two to
compare them.

A folder opens on, and the overview sums it up by, its newest audit; a folder with
none, by its newest run that read documents. "Changed since the run before" on
Home compares a run with the previous run of the same kind, and lists each
document whose identifiers or readiness moved. The overview draws how many
identifiers each folder's recent runs found, beside the latest count.

## Reviewing findings

"Review one by one" on the Security page steps through every finding, the most
serious first, each in the line of page text it sits in:

| Key | Does |
| --- | --- |
| `C` | Keep it: a real finding |
| `I`, then `Enter` | Ignore it, with the reason typed |
| `J`, `K` | Next, previous |
| `N` | The next one not yet reviewed |
| `Esc` | Back to the Security page |

Ignoring writes the audited folder's ignore file under `complydoc ui`, as ticking
a finding off in a document does. What was kept is remembered in the browser, per
folder, by the finding's fingerprint, so a review carries on across runs of the
folder, and the queue reopens at the first finding not yet reviewed.

## Getting around

`⌘K`, or `Ctrl+K`, opens a list to jump to any page, any document by part of its
path, or another run of the folder. A click anywhere on a finding's row opens its
page with the finding marked, and anywhere on a document's row opens the document.

## Settings

The Settings page holds [your own concepts](custom-concepts.md), the models every
report is priced on, and the findings the ignore file sets aside.

- **Concepts and ignored findings** are files beside the documents a report
  audited, which the command line reads too. Under `complydoc ui` they can be
  added, changed and removed here, and changes apply from the next run. A report
  opened any other way shows what its run used, read only.
- **Preferred models** are kept in the browser, and are the same choice as the top
  bar's. A report that did not price the preferred model uses its cheapest model
  from the same provider.

## From Python

`launch_ui` does the same from a script or a notebook, and returns while the
viewer runs in the background:

```python
import complydoc as cd

viewer = cd.launch_ui(".complydoc")
viewer.url      # http://127.0.0.1:8500/
viewer.stop()
```

`block=True` serves in the calling thread instead, and `open_browser=False`
leaves the browser alone.

## What it does not do

- It listens on 127.0.0.1, so nothing else on the network can reach it.
- It answers only requests addressed to this machine by name, so a web page
  elsewhere cannot read the reports through it.
- It serves the viewer and the reports it found, nothing else from the disk.
- Neither the server nor the viewer makes an outbound connection.

The viewer ships inside the package, built. In a checkout of the repository,
`make viewer-bundle` builds it there first.
