# complydoc

complydoc reads documents, or the output of a document loader, and reports:

- **Cost**: text and vision tokens per document, priced per model.
- **Readiness**: measured extraction signals.
- **Identifiers**: personal and financial identifiers, masked.
- **Hidden content**: text a reader does not see and a model does, and text
  that reads as an instruction to a model.
- **Loaders**: what one or several loaders extracted, over a file or a folder,
  with expected facts, failures and parser cost.
- **Chunks**: what a text splitter produces, including cut sentences and facts
  split across chunks.

The Python API also works on plain strings, compares and asserts on saved
reports, streams audits, and provides pipeline steps for LangChain and
LlamaIndex.

It produces a report. It does not modify documents.

It runs on your machine, and makes no outbound connection of its own; see
[Network isolation](explanation/offline.md). A hosted companion for teams, complydoc
Cloud, is planned: history across runs, comparing runs, and the pages this repository's
[viewer](https://github.com/complydoc/complydoc/tree/main/viewer) shows, shared instead of
opened as a local file. [Say if your team would use it](https://github.com/complydoc/complydoc/discussions).

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
`schema_version`, currently 16. Identifiers are masked everywhere in both,
including the page text, unless the run used `--reveal`; `--page-images` adds a
picture of each page, which shows them.

## Network access

The process makes no outbound connections of its own. Before any file is opened,
`socket.socket.connect`, `connect_ex`, `socket.create_connection` and
`socket.getaddrinfo` are replaced with functions that raise. `AF_UNIX` sockets
are permitted. Each report records whether the guard was active. Model prices
are vendored as data files.

Two things a caller can ask for send data out. An instruction classifier backed
by a hosted service sends the passages it judges; the report names the hosts in
`run.content_sent_to`, states it as an important limitation, and
`expect(report).no_network()` fails. [`complydoc assist`](guides/assist.md)
sends a finished report to a hosted chat model. Both need `allow_network=True`
and neither runs as part of an audit. See
[Network isolation](explanation/offline.md).

## Limits

- **Masking is best effort.** Categories with a checksum are confirmed; names and
  organisations come from a statistical model and are missed at some rate.
- **Unmeasured signals are reported as unmeasured** and excluded from scores.
- **Table fidelity describes the extractor that ran.** Only an extractor that reads table
  structure detects a table at all, so the measurement is of that reader's own text.
- **Hidden-content checks** cover PDF text layers and the markup of Word, Excel,
  PowerPoint, HTML, Markdown and email files, not text inside images.

## Contents

| | |
| --- | --- |
| [Audit a folder](guides/audit-a-folder.md) | Running it, and reading the report |
| [Page routing](guides/routing.md) | Which pages need OCR or a vision model, and what the mix costs |
| [Policy files](guides/policy.md) | Rules in YAML, checked in CI, with Markdown and SARIF output |
| [GitHub Action](guides/github-action.md) | The policy check on every pull request, with a comment and code scanning |
| [Drafting quick wins](guides/assist.md) | `complydoc assist`, which sends a report to a hosted chat model |
| [Safe copies](guides/clean.md) | Masked copies of documents, with their metadata removed |
| [Python API](guides/python-api.md) | Conventions, strings, configuration in code, extending |
| [Extracting masked text](guides/extract-masked-text.md) | Masked text, token counts, warnings |
| [Inspecting a loader](guides/inspect-a-loader.md) | LangChain and LlamaIndex output, metadata, network attempts |
| [Comparing loaders](guides/compare-loaders.md) | Several loaders on the same files |
| [Inspecting chunks](guides/inspect-chunks.md) | Splitter output: sizes, cut sentences and tables, facts |
| [Report tables](guides/report-tables.md) | Jupyter display and pandas tables |
| [Baselines and tests](guides/baselines-and-tests.md) | Reading reports back, diffs and assertions |
| [Streaming and steps](guides/streaming-and-steps.md) | Streaming audits, cached loader output, pipeline steps |
| [Name detection models](guides/name-detection-models.md) | Your own spaCy or other models for names and organisations |
| [Hidden content](explanation/hidden-content.md) | Visibility and instruction evidence |
| [Detection accuracy](explanation/accuracy.md) | What detection finds and wrongly flags, measured |
| [Command line](reference/cli.md) | Every command and flag |
| [Python API](reference/api.md) | `import complydoc as cd` |
| [Report JSON](reference/report.md) | The shape a run writes |
| [Configuration](reference/configuration.md) | The YAML files |
| [Identifiers](reference/identifiers.md) | Every identifier category and how it is found |
