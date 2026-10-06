<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/logo-dark.svg">
    <img alt="complydoc" src="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/logo-light.svg" width="42%">
  </picture>

  <h3>Know your documents before they reach an LLM.</h3>

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

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/viewer-trace-dark.webp">
  <img alt="The complydoc viewer: a LangChain ingestion pipeline's runs, and one run traced step by step, each loader, splitter, vector store and embedding call on a time axis with its time, cost and the identifiers it passed on, and warnings on a scanned file that loaded no text" src="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/viewer-trace-light.webp" width="100%">
</picture>

complydoc is the observability layer for AI ingestion pipelines. It traces every step
between your documents and your vector store (loading, cleaning, splitting, embedding,
storing) with what each one cost, how long it took and what it passed on, and follows
each document through them. It warns of the failures that raise no error, such as a scan
that loaded no text, puts different loaders' readings of the same document side by side,
and flags the personal or financial identifiers, and instructions hidden for a model,
that make it through.

It runs on your machine, and nothing leaves it unless you ask.

## Quickstart

```bash
uv tool install complydoc        # or: pip install complydoc
```

Observe an ingestion pipeline as it runs, every loader, splitter, embedding call and
vector store a step:

```python
import complydoc as cd

with cd.observe("contracts-ingest"):
    documents = PyMuPDF4LLMLoader("contract.pdf").load()
    chunks = splitter.split_documents(documents)
    vector_store.add_documents(chunks)
```

Compare loaders on your own documents, page by page:

```python
from langchain_community.document_loaders import PyPDFLoader
from langchain_pymupdf4llm import PyMuPDF4LLMLoader

report = cd.compare_loaders(
    {"PyPDFLoader": PyPDFLoader, "PyMuPDF4LLMLoader": PyMuPDF4LLMLoader},
    paths="./contracts",
    page_images=True,
)
cd.write_json(report, ".complydoc/loaders.json", detail="full")
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/viewer-diff-dark.webp">
  <img alt="The complydoc viewer: two readers' readings of the same page side by side, with the page itself beside them" src="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/viewer-diff-light.webp" width="100%">
</picture>

Or audit a folder from the command line:

```bash
complydoc audit ./contracts
```

Then open it all in the viewer, served from your machine:

```bash
complydoc ui
```

The [playground](https://github.com/complydoc/playground) has all of this ready to run.

## What it shows

- **Pipeline traces**: each LangChain or LlamaIndex loader, splitter and embedding call as a
  step, with its settings, time, tokens, cost and what it passed on.
- **Loader diffs**: every loader's reading of a document side by side, line by line, with
  the page it came from.
- **Identifiers**: personal and financial identifiers from Europe, the Americas, India and
  Australia, checksum-validated where a checksum exists, and masked until you choose to see
  them.
- **Hidden content**: text a reader does not see and a model does, and passages written as
  instructions to a model.
- **Chunks**: splitters side by side, drawn over the text, with the sentences and tables
  they cut.
- **Cost**: text and vision tokens per page, priced across models and extraction paths.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/complydoc-architecture-dark.svg">
  <img alt="complydoc architecture: files and loader output feed four analyses (cost, readiness, identifiers, hidden content) that produce a report and masked text, inside a network guard" src="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/complydoc-architecture.svg" width="100%">
</picture>

## In CI

`complydoc check` holds a folder to rules written in YAML and fails when they break. On
GitHub, the repository is also an action:

```yaml
- uses: complydoc/complydoc@v0.6.8
  with:
    path: documents
    policy: policy.yaml
```

See [GitHub Action](https://complydoc.github.io/complydoc/docs/guides/github-action/) and
[Policy files](https://complydoc.github.io/complydoc/docs/guides/policy/).

## Privacy

Outbound connections and DNS lookups are blocked for the whole run, and every report records
that they were. Identifiers are masked in every output, the page text included. The only
things that send data anywhere are ones you add yourself, such as a hosted parser or the
optional `typesafe` and `assistant` extras, and they run only with `allow_network=True`. See
[Network isolation](https://complydoc.github.io/complydoc/docs/explanation/offline/).

## Optional extras

Reading scans and finding names are optional, because they are large. Every report says
when they were missing.

| Extra | Size | Adds |
| --- | --- | --- |
| `ocr` | ~80 MB | Reads scans and images |
| `multilingual-names` | ~2 GB | Finds people and companies in European languages |
| `ner` | ~50 MB | Finds names with spaCy's small English model |

```bash
uv tool install "complydoc[ocr,multilingual-names]"
complydoc doctor              # what is installed, and the command for anything missing
```

The name models are downloaded once, before a scan, never during one: `complydoc doctor`
prints the command. [Detection accuracy](https://complydoc.github.io/complydoc/docs/explanation/accuracy/)
publishes how often each finds and misses names.

## Resources

- [Documentation](https://complydoc.github.io/complydoc/docs/)
- [Playground](https://github.com/complydoc/playground): runnable examples, with a CI workflow
- [Command line](https://complydoc.github.io/complydoc/docs/reference/cli/) and
  [Python API](https://complydoc.github.io/complydoc/docs/reference/api/) references
- [Changelog](https://github.com/complydoc/complydoc/blob/main/src/complydoc/CHANGELOG.md)
- [Contributing](https://github.com/complydoc/complydoc/blob/main/CONTRIBUTING.md)

## License

MIT
