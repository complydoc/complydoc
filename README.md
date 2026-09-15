<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/logo-dark.svg">
    <img alt="complydoc" src="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/logo-light.svg" width="42%">
  </picture>

  <h3>Document analysis for LLM pipelines, fully offline.</h3>

  <a href="https://pypi.org/project/complydoc/"><img src="https://img.shields.io/pypi/v/complydoc?color=1a7f4b&cacheSeconds=3600" alt="PyPI version"></a>
  <a href="https://pypi.org/project/complydoc/"><img src="https://img.shields.io/pypi/dm/complydoc?color=1a7f4b&cacheSeconds=3600" alt="PyPI downloads"></a>
  <a href="https://github.com/duartecaldascardoso/complydoc/actions/workflows/checks.yml"><img src="https://github.com/duartecaldascardoso/complydoc/actions/workflows/checks.yml/badge.svg?branch=main" alt="Tests"></a>
  <a href="https://duartecaldascardoso.github.io/complydoc/"><img src="https://img.shields.io/badge/docs-complydoc-1a7f4b" alt="Documentation"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-1a7f4b" alt="License"></a>
</div>

<br>

complydoc inspects documents, and the output of document loaders, before they are sent to
an LLM. It measures what processing them will cost, how reliably text can be read off each
page, which personal and financial identifiers they contain, and whether anything hidden in
a file is addressed to a model.

> [!TIP]
> Run `complydoc demo` to produce a full report on the sample documents bundled with the package.

## Quickstart

```bash
uv tool install complydoc
complydoc audit ./documents
```

```python
import complydoc as cd

report = cd.full_audit("./documents")
print(report.overall.score)
cd.write_html(report, "report.html")
```

Output from a LangChain or LlamaIndex loader, or several loaders over a folder:

```python
from langchain_community.document_loaders import PDFPlumberLoader, PyPDFLoader

report = cd.inspect_documents(PyPDFLoader("contract.pdf"))

report = cd.compare_loaders(
    {"pypdf": PyPDFLoader, "pdfplumber": PDFPlumberLoader, "docling": cd.parsers.docling()},
    paths="./contracts",
    facts=["Payment is due within thirty days"],
)
report.to_pandas("loaders")
```

The same from the command line, for CI:

```bash
complydoc compare-loaders loaders.yaml
complydoc chunks ./documents --splitter "langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=800"
complydoc diff baseline.json .complydoc/complydoc.json
```

OCR and name detection are optional extras. `complydoc doctor` shows what is installed.

## What it reports

- **Token cost**: text and vision tokens per document, priced across models and three
  extraction paths (text layer, OCR, vision).
- **Extraction readiness**: measured signals such as text layer coverage, tables, columns,
  rotation, scan resolution, garbled characters, glyph codes and repeated headers.
- **Identifiers**: personal and financial identifiers from Europe, the Americas, India and Australia,
  checksum-validated where a checksum exists, masked in every output.
- **Hidden content and prompt injection**: text a reader does not see and a model does
  (white or invisible text, hidden formatting, Unicode tag characters), and passages that
  read as instructions to a model.
- **Loader inspection and comparison**: what a loader extracted, the metadata it attached,
  the network connections it attempted, and where several loaders disagree, over a single
  input or a folder, with failures, load time and estimated parser cost per loader.
- **Expected facts**: whether passages you expect appear in each loader's text, as exact or
  fuzzy matches.
- **Parser presets**: Docling, Unstructured, LlamaParse and Azure Document Intelligence;
  hosted parsers run only with `allow_network=True`.
- **Tables**: every part of a report as a pandas DataFrame, and a summary in Jupyter.
- **Python API**: scanning and masking strings, chunk inspection, baselines with diffs and
  assertions for tests, streaming audits, cached loader output, and pipeline steps for
  LangChain and LlamaIndex.
- **Masked text**: the documents' text with identifiers covered, chunked and counted in
  tokens.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/complydoc-architecture-dark.svg">
  <img alt="complydoc architecture: files and loader output feed four analyses (cost, readiness, identifiers, hidden content) that produce a report and masked text, inside a network guard" src="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/complydoc-architecture.svg" width="100%">
</picture>

## How it works

- **Offline**: outbound sockets and DNS lookups are blocked for the whole run, and each
  report records that the guard was armed.
- **Unmeasured values**: a signal that cannot be measured is reported as unmeasured and left
  out of scores.
- **Evidence tiers**: every finding states how it was established, whether by checksum,
  corroboration, pattern or model.
- **Configurable**: prices, signal weights and detection patterns are YAML files, and name
  detection can use your own spaCy models, per language, or any other model as a detector.
- **One report**: a self-contained HTML file and a JSON file with a versioned schema.

## Resources

- [Documentation](https://duartecaldascardoso.github.io/complydoc/): guides and design notes
- [Command line reference](https://duartecaldascardoso.github.io/complydoc/reference/cli/)
- [Python API reference](https://duartecaldascardoso.github.io/complydoc/reference/api/)
- [Report JSON](https://duartecaldascardoso.github.io/complydoc/reference/report/)
- [Changelog](https://github.com/duartecaldascardoso/complydoc/blob/main/src/complydoc/CHANGELOG.md)
- [Contributing](https://github.com/duartecaldascardoso/complydoc/blob/main/CONTRIBUTING.md)

## License

MIT
