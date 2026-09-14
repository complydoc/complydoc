<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/logo-light.svg">
    <img alt="complydoc" src="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/logo-light.svg" width="42%">
  </picture>
</div>

<div align="center">
  <h3>Offline analysis of documents before they reach an LLM.</h3>
</div>

<div align="center">
  <a href="https://pypi.org/project/complydoc/"><img src="https://img.shields.io/pypi/v/complydoc?color=1a7f4b" alt="PyPI"></a>
  <a href="https://github.com/duartecaldascardoso/complydoc/actions/workflows/checks.yml"><img src="https://github.com/duartecaldascardoso/complydoc/actions/workflows/checks.yml/badge.svg?branch=main" alt="Tests"></a>
  <a href="https://duartecaldascardoso.github.io/complydoc/"><img src="https://img.shields.io/badge/docs-complydoc-1a7f4b" alt="Documentation"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-1a7f4b" alt="License"></a>
  <img src="https://img.shields.io/badge/python-3.11%20%7C%203.12%20%7C%203.13-4f5d75" alt="Python versions">
</div>

<br>

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/complydoc-architecture-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/complydoc-architecture.svg">
    <img alt="complydoc architecture: files and loader output feed four analyses (cost, readiness, identifiers, hidden content) that produce a report and masked text, inside a network guard" src="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/complydoc-architecture.svg" width="100%">
  </picture>
</div>

complydoc reads documents, or the output of a document loader, and reports:

| | |
| --- | --- |
| **Cost** | Text and vision tokens per document, priced per model |
| **Readiness** | Measured extraction signals: text layer, coverage, tables, columns, rotation, scan resolution |
| **Identifiers** | Personal and financial identifiers, checksum-validated where one exists, masked |
| **Hidden content** | Text a reader does not see and a model does, and text that reads as an instruction to a model |

Everything runs locally. Outbound sockets and DNS lookups are blocked for the duration of a run,
and each report records that the guard was armed.

## Install

```bash
uv tool install complydoc
```

Optional extras: `ocr` for scanned pages, `ner` for names and organisations (plus the
`en_core_web_sm` model). `complydoc doctor` lists what is available.

## Command line

```bash
complydoc demo                                   # audit the bundled sample documents
complydoc audit ./documents                      # writes .complydoc/complydoc.{html,json}
complydoc sensitive ./documents                  # identifiers and hidden content only
complydoc readiness ./documents
complydoc cost ./documents --monthly-volume 2500
complydoc compare ./documents                    # read each page with every installed extractor
```

Formats: PDF, PNG, JPG, TIFF, BMP, DOCX, XLSX. `complydoc --help` lists every command and flag.

## Python

```python
import complydoc as cd

report = cd.full_audit("./documents")
report.overall.score
report.documents[0].sensitive.matches
report.documents[0].content_findings
cd.write_html(report, "report.html")
```

Loader output, from LangChain, LlamaIndex or anything with the same shape:

```python
from langchain_community.document_loaders import PDFPlumberLoader, PyPDFLoader

report = cd.inspect_documents(PyPDFLoader("contract.pdf"))
report = cd.compare_loaders(
    {"pypdf": PyPDFLoader("contract.pdf"), "pdfplumber": PDFPlumberLoader("contract.pdf")}
)
```

Text with identifiers masked, chunked and counted in tokens:

```python
result = cd.extract_text("./documents", max_tokens=2000)
for chunk in result.chunks:
    chunk.text, chunk.tokens
```

## Output

- One self-contained HTML file and a JSON file with the same data. The JSON carries
  `schema_version`.
- Identifiers are masked to the last four characters. `--reveal` shows them in full and the
  report records it.
- Extracted text and page images are document content. `--no-extracted-text` and
  `--no-page-images` leave them out.

## Configuration

Prices, signal weights, detection patterns and instruction patterns are YAML files:
`pricing.yaml`, `readiness.yaml`, `sensitive.yaml`, `hidden.yaml`. Pass `--config-dir` to use
your own.

## Documentation

[duartecaldascardoso.github.io/complydoc](https://duartecaldascardoso.github.io/complydoc/)

## Development

```bash
uv sync --group dev
uv run pytest
uv run ruff check src && uv run mypy src/complydoc
```

| Path | Contents |
| --- | --- |
| `src/complydoc` | The package |
| `src/complydoc/ui` | Report template, stylesheet and script |
| `src/tests` | Tests; `src/tests/integration` needs the `integrations` group |
| `src/scripts` | Price table, diagram and SBOM builders |
| `docs` | Documentation site |

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [changelog](src/complydoc/CHANGELOG.md).

## Licence

MIT
