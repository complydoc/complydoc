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
first. A report written while the viewer runs appears when the page is reloaded.

Name report files or other folders to open those instead:

```bash
complydoc ui reports/ baseline.json
```

| Option | Default | What it does |
| --- | --- | --- |
| `--port`, `-p` | 8500 | The port to serve on. The next free one is used when it is taken |
| `--no-browser` | | Print the address without opening the browser |

## What the viewer shows

The report every run writes: a dashboard, every finding linked to where it
sits, and the cost of each model under a loading plan.

Every run opens on the same pages, whichever command wrote it, and opens on Traces,
where its calls are, or every run of the folder to pick from. A run with neither opens
on its Dashboard.

| Page | Holds | Written by |
| --- | --- | --- |
| Dashboard | The headline figures, where the run's time went step by step, each run of the folder or pipeline against the others (duration, cost, identifiers, warnings), and the findings and documents to look at first | every run |
| Traces | Every run of the folder or pipeline, and a run's trace: every call a pipeline made, or every document an audit read, with each one's time, input and output | `cd.observe`, `audit` |
| Security | Identifiers and hidden instructions, per document and page | `audit`, `sensitive` |
| Documents | Each document's pages, text and readings; for a loader comparison, every loader's reading beside the others in a document's Diff | every run that reads documents |
| Chunks | How each text splitter cut the text, and the documents it cut worst | `chunks` |
| Cost & time | Each model's price for the folder, and reading time | `audit`, `cost` |

The sidebar groups them by what they are for, with a figure beside each where one
says something, such as the high-severity identifiers beside Security. Pages the
run has nothing for are folded together at the end. Documentation, at the foot,
opens the guide for the page on screen.

### The trace

The Traces page lists every run of the folder, or of a pipeline recorded with
[`cd.observe`](observe-a-pipeline.md), newest first: when it started, how long it
took, its warnings, tokens, cost, where it sent text and the identifiers it sent.
Above the table are figures across the runs. Picking a run opens its trace in a
panel over the page, the table still showing beside it: up and down go to the next
run, Escape closes it, and its left edge resizes it. A run without a trace, such as a
chunks run, opens where what it holds is shown.

A trace is a waterfall, every call showing when it opens. The run is at the root, each step under it, and a component
called several times in a row, such as a loader called once a file, is one row that
opens onto each call. Each row is drawn where it ran on the run's time axis, with its
time, cost and the identifiers it passed on; a warning sign marks a step with a
warning. Search narrows the tree to the calls whose name or file matches, and two
switches to the calls that passed on an identifier or had a warning or an error. Up
and down, or J and K, move through the calls; left and right fold and unfold one.

The call picked shows its warnings, its figures, its input and output as YAML, its
settings and everything else measured about it. A step that raised shows where, in
its traceback. A split shows the spread of its chunks' sizes, the flags complydoc
set on them and the smallest few.

Two more views follow the run another way. Documents follows each document from the
loader that read it to where it was sent: what each step made of it, the identifiers
it gained or lost, its warnings, and whether it reached the end at all. Identifiers
follows each identifier through the steps.

An audit is shown as a trace too, from the times it recorded: its folders, each
document in them, and inside each document its readers, OCR, the analysis and the
identifier scan. A large run opens folded, a line a folder.

### How pages are read

The top bar of the Dashboard, Documents and Cost & time sets how every cost and time in the report
is worked out:

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
the guide. The Dashboard does the same card by card, so a `complydoc cost` run shows its
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

The identifiers found on a page are blacked out in its picture; a page with one that
could not be placed is shown as its outline instead, and says so. They are kept in the
`.parts` folder beside the report, and the viewer fetches a page's
picture only when the page is shown, so a report of thousands of pages opens as fast as
one without them. A report opened as a file in the browser, rather than with `complydoc
ui`, shows each page as its outline instead.

The text is masked, as the report is. A report written with `--reveal` holds the
values as well as a masked copy of every page. The viewer opens it masked, and
the eye button shows the values until you mask them again. On any other report,
the button is disabled.

## Runs of a folder

Every report of the same folder is one of its runs, whichever command wrote it; the
runs of a pipeline recorded with `cd.observe` are grouped under the pipeline's name.
The switcher at the top of the sidebar names each run by its kind (Audit, Cost,
Loader comparison, Chunks, Pipeline and so on) and when it started, and opens any of
them. The Traces page lists them all, newest first; click a run to open it.

A folder opens on, and the overview sums it up by, its newest audit; a folder with
none, by its newest run that read documents.

### Which change a run came from

A run records where it came from, so a list of runs from several machines says
which change produced which. The Traces page shows it as a Commit column: the
branch and the commit, the repository when the pointer rests on it, and a link
to the CI run when there is one.

It is read from what the machine already knows, and nothing is asked of the
network:

- In GitHub Actions and GitLab CI, from the job's own variables: repository,
  branch, commit, workflow and the page of the run.
- Anywhere else, from git, about the folder the command ran in: repository,
  branch, commit, and whether there were uncommitted changes.

The repository is recorded as `host/owner/name`. A token or a password in the
remote's address is never recorded.

| Variable | Sets |
| --- | --- |
| `COMPLYDOC_REPOSITORY`, `COMPLYDOC_BRANCH`, `COMPLYDOC_COMMIT` | The repository, branch and commit, in place of what was found |
| `COMPLYDOC_WORKFLOW`, `COMPLYDOC_RUN_URL` | The CI workflow and the page of its run, for a CI system complydoc does not know |
| `COMPLYDOC_CONTEXT=off` | Nothing is recorded |

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

`⌘K`, or `Ctrl+K`, opens a search over every page, every document by part of its
path, the folder's other runs, and things to do. It opens on where you have just been;
the tabs under the search show one kind at a time, and `←` and `→` change the tab while
nothing is typed. A click anywhere on a finding's row opens its
page with the finding marked, and anywhere on a document's row opens the document.

| Key | Does |
| --- | --- |
| `G` then `D`, `T`, `S`, `F`, `C`, `M`, `,` | Dashboard, Traces, Security, Documents, Chunks, Cost & time, Settings |
| `?` | Every shortcut |
| `↑`, `↓` | In a trace, the newer or older run |
| `J`, `K` | In a trace, the next or previous call |
| `X` | Pick the finding under the pointer, or let it go |
| `Esc` | Close the trace, or let every picked finding go |

A right-click on a document or a finding offers what can be done with it: open it, or
copy its path or its fingerprint. Findings picked together can be ignored for one reason,
or have their fingerprints copied for `complydoc ignore`, from the bar that shows at the
foot of the page. A table's sort and search stay in the address, so a view can be linked
and is there on coming back.

## Settings

The Settings page holds [your own concepts](custom-concepts.md), the
[categories](categories.md) that are looked for, the models every report is priced on,
and the findings the ignore file sets aside.

- **Concepts, categories and ignored findings** are files beside the documents a report
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

## Serve it to a team

By default only this machine can open the viewer. `--host` gives it another
address to listen on, so everyone who can reach that address opens the same
reports:

```bash
complydoc ui ./reports --host 0.0.0.0
```

```text
Viewer  http://reports-01:8500/  Ctrl+C stops it
Served on 0.0.0.0: anyone who can reach it reads these reports, with no sign-in.
It is read-only.
```

Three things change when it is served this way:

- **It is read-only.** The viewer has no sign-in, so it changes no file: the
  ignore, concepts and categories files are shown as they are, and a finding
  ignored in the page lasts while that page is open. The header says
  "Read-only". `--allow-edits` lets readers change those files, each change
  recorded under the name of the user the server runs as; use it only where
  everyone who can reach the server should be able to.
- **It answers to this machine's names and addresses**, and refuses a request
  that names any other host, which is what stops a page elsewhere from reading
  the reports through a browser inside your network. Behind a proxy, give it
  the name the proxy serves it under: `--allowed-host reports.example.com`.
  `--allowed-host '*'` accepts every name, for a proxy that checks it already.
- **The browser is not opened**, since the server is usually another machine.

The viewer has no accounts and no encryption of its own. Put it on a network
you trust, or behind the proxy that already signs your people in and serves
HTTPS. Reports hold masked values unless the run used `--reveal`; a shared
viewer is a reason not to.

`--read-only` does the same on your own machine, for showing reports without
changing anything by accident. From Python, `launch_ui` takes `host`,
`read_only` and `allowed_hosts`.

## What it does not do

- It listens on 127.0.0.1 unless `--host` says otherwise, so nothing else on the
  network can reach it.
- It answers only requests addressed to this machine by name, so a web page
  elsewhere cannot read the reports through it.
- It serves the viewer and the reports it found, nothing else from the disk.
- Neither the server nor the viewer makes an outbound connection.

The viewer ships inside the package, built. In a checkout of the repository,
`make viewer-bundle` builds it there first.
