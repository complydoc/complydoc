<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/logo-dark.svg">
    <img alt="complydoc" src="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/logo-light.svg" width="42%">
  </picture>

  <h3>Check documents before they reach an LLM.</h3>

  <a href="https://pypi.org/project/complydoc/"><img src="https://img.shields.io/pypi/v/complydoc?color=1a7f4b&label=pypi" alt="PyPI"></a>
  <a href="https://github.com/complydoc/complydoc/actions/workflows/checks.yml"><img src="https://github.com/complydoc/complydoc/actions/workflows/checks.yml/badge.svg?branch=main" alt="Tests"></a>
  <a href="https://complydoc.github.io/complydoc/docs/"><img src="https://img.shields.io/badge/docs-complydoc-1a7f4b" alt="Documentation"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-1a7f4b" alt="License"></a>
  <br><br>

  <strong>Works with</strong><br>
  <a href="https://github.com/langchain-ai/langchain">LangChain</a> &middot;
  <a href="https://github.com/run-llama/llama_index">LlamaIndex</a> &middot;
  <a href="https://github.com/Unstructured-IO/unstructured">Unstructured</a> &middot;
  <a href="https://github.com/docling-project/docling">Docling</a> &middot;
  <a href="https://github.com/run-llama/llama_cloud_services">LlamaParse</a> &middot;
  <a href="https://learn.microsoft.com/azure/ai-services/document-intelligence/">Azure Document Intelligence</a>
</div>

<br>

complydoc inspects documents, and the output of document loaders, before they are sent to
an LLM. It measures what processing them will cost, how reliably text can be read off each
page, which personal and financial identifiers they contain, and whether anything hidden in
a file is addressed to a model.

It runs on your machine. Nothing leaves it unless you ask for that: see
[How it works](#how-it-works). A hosted companion for teams, complydoc Cloud, is planned;
[say if your team would use it](https://github.com/complydoc/complydoc/discussions).

> [!TIP]
> Run `complydoc demo` to produce a full report on the sample documents bundled with the package.

## Quickstart

```bash
uv tool install complydoc
complydoc audit ./documents
complydoc ui                  # the reports in the viewer, served from this machine
```

```python
import complydoc as cd

report = cd.full_audit("./documents")
print(report.overall.score)
cd.write_html(report, "report.html")
```

Output from a LangChain or LlamaIndex loader, or several loaders over a folder:

```python
from langchain_pymupdf4llm import PyMuPDF4LLMLoader

report = cd.inspect_documents(PyMuPDF4LLMLoader("contract.pdf"))

report = cd.compare_loaders(
    {"pymupdf4llm": PyMuPDF4LLMLoader, "docling": cd.parsers.docling()},
    paths="./contracts",
    facts=["Payment is due within thirty days"],
)
report.to_pandas("loaders")
```

Any loader with a `load` method, or any callable, works the same way. Reports tag each loader
with the framework and library it came from. Moving off `langchain-community`, which LangChain
archived in June 2026? [Replacing a langchain-community loader](https://complydoc.github.io/complydoc/docs/guides/replace-langchain-community/)
compares a retired loader with its replacement.

The same from the command line, for CI:

```bash
complydoc routing ./documents
complydoc compare-loaders loaders.yaml
complydoc chunks ./documents --splitter "langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=800"
complydoc diff baseline.json .complydoc/complydoc.json
complydoc check ./documents --policy policy.yaml --markdown summary.md --sarif results.sarif
complydoc clean ./documents --out clean/
```

`check` holds a folder to rules written in YAML and exits non-zero when they fail, with a
summary for a pull request comment and SARIF for code scanning. On GitHub, the repository
is also an action that does all three:

```yaml
- uses: complydoc/complydoc@v0.6.0
  with:
    path: documents
    policy: policy.yaml
```

See [GitHub Action](https://complydoc.github.io/complydoc/docs/guides/github-action/) for the
inputs, permissions and code scanning. `clean` writes safe copies:
the identifiers masked, the metadata removed, and PDFs rasterised on request.

A parser can hang on a malformed file: `--timeout 120` gives each document a deadline and
lists the ones it stopped.

### Optional extras

A plain install reads documents, prices them, measures extraction readiness, finds
identifiers by pattern and checks for hidden content. It does not read scans or find
names, and every report says so. Those are optional because they are large:

| Extra | Size | What it adds | Without it |
| --- | --- | --- | --- |
| `ocr` | ~80 MB | Reads scans and images | Pages with no text layer are reported as unread |
| `multilingual-names` | ~2 GB | Finds people and companies in European languages | Names are not scanned for, unless `ner` is installed |
| `ner` | ~50 MB | Finds names with spaCy's small English model | Names are not scanned for, unless `multilingual-names` is installed |
| `typesafe` | small | Judges passages that read as instructions to a model, with a hosted service | Instructions are found by pattern alone |
| `assistant` | small | `complydoc assist`, which drafts quick wins from a finished report with a hosted chat model | Quick wins are the ones the report computes on its own |

```bash
uv tool install "complydoc[ocr,multilingual-names]"
"$(uv tool dir)/complydoc/bin/python" -c "from transformers import pipeline; \
    pipeline('token-classification', model='Babelscape/wikineural-multilingual-ner')"
```

The second command downloads the name model once, into the Hugging Face cache. Nothing is
downloaded while a scan runs, so the model has to be fetched before it can be used. With
pip, install `"complydoc[ocr,multilingual-names]"` and run the same line with your own
`python`. The `ner` extra needs its model too, `en_core_web_sm`. `complydoc doctor` prints
the command for whatever is missing.

Names are the part worth understanding before choosing. The multilingual model is the
better reader; spaCy's small English one misses names in other languages and mistakes
field labels for companies. Neither is a checksum, so both miss some names:
[Detection accuracy](https://complydoc.github.io/complydoc/docs/explanation/accuracy/)
publishes the measured numbers for each.

Two extras change where your documents go, and nothing else in complydoc leaves the
machine. `typesafe` sends the passages it judges to a hosted service. `assistant` powers
`complydoc assist`, which sends a finished report to a hosted chat model: its findings,
signals, loaders and costs, with the page pictures and the page text held back. Both are
off unless the caller passes `allow_network=True`, both name the host before they run, and
the guard blocks everything else.

`complydoc doctor` shows what is installed, and `complydoc benchmark` prints what detection
finds and what it wrongly flags against a labelled corpus that ships with the package.

## What it reports

- **Formats**: PDF, scans and images, Word, Excel, PowerPoint, HTML, Markdown, plain text
  and email (`.eml`).
- **Token cost**: text and vision tokens per document, priced across models and three
  extraction paths (text layer, OCR, vision).
- **Page routing**: the path each page needs — its text layer, local OCR or a vision model —
  with the reason, priced as a mix against sending everything one way, and written as a
  manifest an ingestion job can read.
- **Extraction readiness**: measured signals such as text layer coverage, tables, columns,
  rotation, scan resolution, garbled characters, glyph codes and repeated headers.
- **Identifiers**: personal and financial identifiers from Europe, the Americas, India and Australia,
  checksum-validated where a checksum exists, masked in every output, the page text
  included, unless `--reveal` is passed.
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
- **Safe copies**: the same document with its identifiers masked and its metadata removed,
  for text, Markdown, HTML, email and Office files. A PDF copy has its metadata stripped and
  can be rasterised, which leaves no text layer to read.
- **Measured accuracy**: what identifier detection finds and what it wrongly flags, scored
  against a labelled corpus that ships with the package and published with the numbers.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/complydoc-architecture-dark.svg">
  <img alt="complydoc architecture: files and loader output feed four analyses (cost, readiness, identifiers, hidden content) that produce a report and masked text, inside a network guard" src="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/complydoc-architecture.svg" width="100%">
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
- **One report**: a self-contained HTML file and a JSON file with a versioned schema,
  safe to share: identifiers are masked throughout and pages are drawn as wireframes.
  `--page-images` embeds a picture of each page instead, and says that it shows them.

## Resources

- [Website](https://complydoc.github.io/complydoc/)
- [Documentation](https://complydoc.github.io/complydoc/docs/): guides and design notes
- [Command line reference](https://complydoc.github.io/complydoc/docs/reference/cli/)
- [Python API reference](https://complydoc.github.io/complydoc/docs/reference/api/)
- [Playground](https://github.com/complydoc/playground): runnable command line and Python examples, with a CI workflow
- [Report JSON](https://complydoc.github.io/complydoc/docs/reference/report/)
- [Changelog](https://github.com/complydoc/complydoc/blob/main/src/complydoc/CHANGELOG.md)
- [Contributing](https://github.com/complydoc/complydoc/blob/main/CONTRIBUTING.md)

## License

MIT
