# complydoc

complydoc reads a folder of documents and reports three things: the token cost
of processing them with an LLM, a set of measured signals describing how
extractable they are, and the personal and financial identifiers they contain.

It runs entirely on the local machine. It produces a report; it does not modify
documents or extract structured data from them.

## Install

```bash
uv tool install complydoc
```

OCR and name detection are optional extras. `complydoc doctor` reports which are
installed and what their absence excludes from a run.

## Run

```bash
complydoc demo
```

Audits six synthetic documents shipped with the package and writes a report:

```text
Documents         6 (6 pages)
Text path         $0.0001
Vision path       $0.0009
AI readiness      77.4/100 (content)
Global readiness  82.4/100 ready
Sensitive items   20 in 4/6 docs

2 important limitations — see the report before drawing conclusions.
```

Against your own documents:

```bash
complydoc audit ~/contracts --ocr
```

## Output

Two files per run: a self-contained HTML report and a JSON file with the same
data. The JSON carries `schema_version`, currently 3.

![The HTML report, summary tab](https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/report-light.png#only-light)
![The HTML report, summary tab](https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/report-dark.png#only-dark)

## Network access

The process makes no outbound connections. Before any file is opened,
`socket.socket.connect`, `connect_ex`, `socket.create_connection` and
`socket.getaddrinfo` are replaced with functions that raise. `AF_UNIX` sockets
are permitted; `AF_INET` and `AF_INET6` are not. Each report records whether the
guard was active during the run.

Model prices and the model catalogue are vendored as data files rather than
fetched. See [Offline by construction](explanation/offline.md).

## Limits

- **Masking is best effort.** Categories with a checksum (card numbers, IBAN,
  VAT, national identifiers) are confirmed. Names and organisations are found by
  a statistical model and will be missed at some rate. Every extraction reports
  this.
- **Unmeasured signals are reported as unmeasured**, with the reason, and are
  excluded from the score rather than counted as zero.
- **Prices carry provenance.** Entries verified against a provider's page are
  marked separately from entries imported from a catalogue, and a run that
  prices against an imported figure states so in its limitations.

## Where things are

| | |
| --- | --- |
| [Audit a folder](guides/audit-a-folder.md) | Running it, and reading the report |
| [Text for a pipeline](guides/text-for-a-pipeline.md) | Masked text, token counts, warnings |
| [Command line](reference/cli.md) | Every command and flag |
| [Python API](reference/api.md) | `import complydoc as cd` |
| [Report JSON](reference/report.md) | The shape a run writes |
| [Configuration](reference/configuration.md) | `pricing.yaml`, `readiness.yaml`, `sensitive.yaml` |
