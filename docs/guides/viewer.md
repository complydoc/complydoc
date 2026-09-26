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

The same report as the HTML file an audit writes, drawn differently: a Home page,
every finding linked to where it sits, and the cost of each model under a
loading plan.

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

To the left of the text is the page's picture, when the report has one. Put it
away to give the text the whole width.

Page pictures need a report written with them:

```bash
complydoc audit ./documents --page-images --detail full
```

The text is masked, as the report is. A report written with `--reveal` holds the
values as well as a masked copy of every page. The viewer opens it masked, and
the eye button shows the values until you mask them again. On any other report,
the button is disabled.

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
