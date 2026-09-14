# complydoc

complydoc reads documents, or the output of a document loader, and reports:

- **Cost**: text and vision tokens per document, priced per model.
- **Readiness**: measured extraction signals.
- **Identifiers**: personal and financial identifiers, masked.
- **Hidden content**: text a reader does not see and a model does, and text
  that reads as an instruction to a model.
- **Loaders**: what one or several loaders extracted, over a file or a folder,
  with expected facts, failures and parser cost.

It produces a report. It does not modify documents.

## Install

```bash
uv tool install complydoc
```

OCR and name detection are optional extras. `complydoc doctor` reports which are
installed and what their absence excludes from a run.

## Run

```bash
complydoc demo
complydoc audit ~/contracts --ocr
```

```python
import complydoc as cd

report = cd.full_audit("~/contracts")
cd.write_html(report, "report.html")
```

## Output

An HTML report and a JSON file with the same data. The JSON carries
`schema_version`, currently 5.

## Network access

The process makes no outbound connections. Before any file is opened,
`socket.socket.connect`, `connect_ex`, `socket.create_connection` and
`socket.getaddrinfo` are replaced with functions that raise. `AF_UNIX` sockets
are permitted. Each report records whether the guard was active. Model prices
are vendored as data files. See [Network isolation](explanation/offline.md).

## Limits

- **Masking is best effort.** Categories with a checksum are confirmed; names and
  organisations come from a statistical model and are missed at some rate.
- **Unmeasured signals are reported as unmeasured** and excluded from scores.
- **Hidden-content checks** cover PDF text layers and Word and Excel formatting,
  not text inside images.

## Contents

| | |
| --- | --- |
| [Audit a folder](guides/audit-a-folder.md) | Running it, and reading the report |
| [Extracting masked text](guides/extract-masked-text.md) | Masked text, token counts, warnings |
| [Inspecting a loader](guides/inspect-a-loader.md) | LangChain and LlamaIndex output, metadata, network attempts |
| [Comparing loaders](guides/compare-loaders.md) | Several loaders on the same files |
| [Report tables](guides/report-tables.md) | Jupyter display and pandas tables |
| [Hidden content](explanation/hidden-content.md) | Visibility and instruction evidence |
| [Command line](reference/cli.md) | Every command and flag |
| [Python API](reference/api.md) | `import complydoc as cd` |
| [Report JSON](reference/report.md) | The shape a run writes |
| [Configuration](reference/configuration.md) | The YAML files |
