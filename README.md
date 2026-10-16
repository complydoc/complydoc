<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/logo-dark.svg">
    <img alt="complydoc" src="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/logo-light.svg" width="42%">
  </picture>

  <h3>Know your documents before they reach an LLM.</h3>
  <p>An open-source, offline audit for documents before they're indexed.</p>

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

<img alt="complydoc audit flagging a white-text clause in a contract PDF that the loaders passed to the model." src="https://raw.githubusercontent.com/complydoc/complydoc/main/docs/assets/hidden-clause.gif" width="100%">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/viewer-trace-dark.webp">
  <img alt="The complydoc viewer: a LangChain ingestion pipeline's runs, and one run traced step by step, each loader, splitter, vector store and embedding call on a time axis with its time, cost and the identifiers it passed on, and warnings on a scanned file that loaded no text" src="https://raw.githubusercontent.com/complydoc/complydoc/main/.github/images/viewer-trace-light.webp" width="100%">
</picture>

A PDF can say one thing to a person and another to your model. White text, tiny type,
an IBAN behind a black bar: it's all still in the text layer, and most loaders pass it
straight through. complydoc shows you what your loaders actually
extracted, page by page, flags the hidden text and the personal and financial identifiers
before they're embedded, and can fail a CI check when a document breaks your policy. It
also traces every ingestion step with its time and cost, and nothing leaves your machine
unless you ask.

## Try it in 30 seconds

A one-page contract with a clause in white text:

```bash
uv tool install complydoc
curl -LO https://raw.githubusercontent.com/complydoc/complydoc/main/examples/hidden_clause.pdf
complydoc audit hidden_clause.pdf
complydoc ui
```

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

Open the run with `complydoc ui`. [Langfuse and Phoenix](https://complydoc.github.io/complydoc/docs/guides/langfuse-phoenix/)
is how an LLM trace points at the same run.

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

## Demo

`examples/hidden_clause.pdf` is one page: two columns, and a sentence in white.
`examples/hidden_clause.py` writes it.

```bash
complydoc audit examples/hidden_clause.pdf --compare-extractor pypdf
complydoc check examples/hidden_clause.pdf --policy examples/hidden_clause.yaml
complydoc ui
```

The audit keeps both readings and flags the white sentence. The check fails on it.
`complydoc ui` opens the report.

<img alt="Terminal: complydoc audit reports one high hidden passage, then complydoc check fails on the white sentence" src="https://raw.githubusercontent.com/complydoc/complydoc/main/docs/assets/hidden-clause.gif">

<img alt="Viewer security page: the white sentence, marked high, confirmed, white text" src="https://raw.githubusercontent.com/complydoc/complydoc/main/docs/assets/hidden-clause-security.png">

<img alt="Viewer document page: complydoc and pypdf side by side, with the white sentence in the text" src="https://raw.githubusercontent.com/complydoc/complydoc/main/docs/assets/hidden-clause-documents.png">

Six pages of the same kind, and what each loader returns from them, are in [What PDF loaders let through](https://complydoc.github.io/complydoc/docs/explanation/pdf-loaders/).

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
- uses: complydoc/complydoc@v0.7.6
  with:
    path: documents
    policy: policy.yaml
```

`policy` can be a file, or a pack that ships with the tool: `finance`, `legal`, `hr`.

See [GitHub Action](https://complydoc.github.io/complydoc/docs/guides/github-action/) and
[Policy files](https://complydoc.github.io/complydoc/docs/guides/policy/).

## For a team

One place where everyone opens the same reports, inside your own infrastructure:

```bash
complydoc ui ./reports --host 0.0.0.0     # served to your team, read-only
docker run -p 8500:8500 -v "$PWD/reports:/reports:ro" ghcr.io/complydoc/complydoc
```

Reports can live in a shared folder or a bucket (`--out s3://bucket/folder`), each run
records the repository, branch and commit it came from, and a Compose file puts the viewer
behind the sign-in your organisation already has. See
[Run it for your team](https://complydoc.github.io/complydoc/docs/guides/team/) and
[Run it in a container](https://complydoc.github.io/complydoc/docs/guides/container/).

## Privacy

Outbound connections and DNS lookups are blocked for the whole run, and every report records
that they were. Identifiers are masked in every output, the page text included. The only
things that send data anywhere are ones you add yourself: a hosted parser or the optional
`typesafe` and `assistant` extras, which run only with `allow_network=True`, and a bucket you
name as the place to keep reports, which receives the report and never the documents. See
[Network isolation](https://complydoc.github.io/complydoc/docs/explanation/offline/).

## Optional extras

Reading scans and finding names are optional, because they are large. Every report says
when they were missing.

| Extra | Size | Adds |
| --- | --- | --- |
| `ocr` | ~80 MB | Reads scans and images |
| `multilingual-names` | ~2 GB | Finds people and companies in European languages |
| `ner` | ~50 MB | Finds names with spaCy's small English model |
| `s3` | ~90 MB | Writes reports to a bucket and serves them from one |

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
- [Langfuse and Phoenix](https://complydoc.github.io/complydoc/docs/guides/langfuse-phoenix/): the ingestion report beside an LLM trace
- [Command line](https://complydoc.github.io/complydoc/docs/reference/cli/) and
  [Python API](https://complydoc.github.io/complydoc/docs/reference/api/) references
- [Changelog](https://github.com/complydoc/complydoc/blob/main/src/complydoc/CHANGELOG.md)
- [Contributing](https://github.com/complydoc/complydoc/blob/main/CONTRIBUTING.md)

## License

MIT
