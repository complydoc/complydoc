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
| Trace | Every call a pipeline made, or every document an audit read, in a tree with each one's time, input and output | `cd.observe`, `audit` |
| Security | Identifiers and hidden instructions, per document and page | `audit`, `sensitive` |
| Documents | Each document's pages, text and readings; for a loader comparison, which loader to use for each file type | every run that reads documents |
| Chunks | How each text splitter cut the text, and the documents it cut worst | `chunks` |
| Cost & time | Each model's price for the folder, and reading time | `audit`, `cost` |

The sidebar groups them by what they are for, with a figure beside each where one
says something, such as the high-severity identifiers beside Security. Pages the
run has nothing for are folded together at the end. Documentation, at the foot,
opens the guide for the page on screen.

### The trace

A run recorded with [`cd.observe`](observe-a-pipeline.md) is a tree of every call
the pipeline made, the calls made inside each beneath it: a directory loader holds a
row for each file. Each row has the call's kind, and pills for its time, coloured by
its share of the run, its tokens, its cost and the identifiers in it. The call picked
shows its input and output as YAML, its settings, and its figures. Up and down, or J
and K, move through the calls; left and right fold and unfold one. The header says
what the run took, cost and sent where, and where its time went by kind of work.
A second view follows each identifier through the steps.

An audit is shown the same way, from the times it recorded: its folders, each
document in them, and inside each document its readers, OCR, the analysis and the
identifier scan. A large run opens folded, a line a folder.

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
command that fills it for the same folder, with a button to copy it, and a link to
the guide. Home does the same card by card, so a `complydoc cost` run shows its
prices and says the identifier scan was not part of it. The Security page says
which identifier categories nothing was looked for, and why. Wherever a document is
named, it is a link to it.

### A document

A document read one way shows every page in turn, its lines numbered, with a header
per page saying what it costs to read. The pages run down the left, a dot on each
that holds findings. What was found is underlined in the text: red for high
severity, amber for medium, dotted for low; a rail at the text's edge marks where
in the whole document. The findings are listed beside the text, page by page, only
when there are some: open one to see the line it sits in, how sure complydoc is,
and a box to tick it off as not a problem. Under `complydoc ui` the tick is saved to
the audited folder's ignore file; otherwise it lasts while the page is open.

A document read more than one way opens as a diff of two readers' text: the kept
reading against another library, OCR or a vision model. The diff shows the two
readings and nothing else; switch to Text to see what was found in it.

Where the run or the folder has a splitter's chunks, the document view can draw them
over the text: pick the splitter beside the title. Chunks alternate in colour so
each boundary shows, and those cut mid-sentence, mid-table or on a heading are in
amber, with a count in each page's header. Chunks are drawn only on pages whose text
is the one they were cut from, so a page read by another reader shows none rather
than wrong ones. The Chunks page links each document it lists to this view, with the
splitter's cuts drawn.

Beside the text, the Page tab shows the page's picture, when the report has one,
and what a vision check made of it.

Page pictures need a report written with them:

```bash
complydoc audit ./documents --page-images
```

The text is masked, as the report is. A report written with `--reveal` holds the
values as well as a masked copy of every page. The viewer opens it masked, and
the eye button shows the values until you mask them again. On any other report,
the button is disabled.

## Runs of a folder

Every report of the same folder is one of its runs, whichever command wrote it; the
runs of a pipeline recorded with `cd.observe` are grouped under the pipeline's name.
The switcher at the top of the sidebar names each run by its kind (Audit, Cost,
Loader comparison, Chunks, Pipeline and so on) and when it started, and opens any of
them. The Runs page lists them newest first with what each holds, and what set it
apart, such as values revealed or identifiers sent. Click a run to open it.

A folder's runs are not compared with each other: its documents come and go between
runs, so a change in its totals says little about the documents. A pipeline's runs
are, two at a time: tick two to see what each made and cost, and their steps lined
up with the settings that changed between them, such as a chunk size or a masking
step added.

A folder opens on, and the overview sums it up by, its newest audit; a folder with
none, by its newest run that read documents.

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
