# Comparing loaders

`compare_loaders` runs several loaders on the same input and reports where their
output differs: the text, the identifiers found in it, the metadata, the
documents returned and the network connections attempted.

```python title="compare_langchain_loaders.py"
--8<-- "examples/compare_langchain_loaders.py"
```

Moving off `langchain-community`? [Replacing a langchain-community loader](replace-langchain-community.md)
says where each loader went and what to compare before switching.

## Input

`loaders` is either a mapping of names to loaders, or a sequence of loaders
named after their class. A second loader of the same class is named
`PyPDFLoader (2)`. Each entry is anything
[`inspect_documents`](inspect-a-loader.md#accepted-input) accepts, including a
list of documents already loaded.

At least two are required. Every loader runs with the same `config`,
`components`, `reveal`, `models` and `allow_network`.

## Loader tags

Each loader is tagged with the framework and library it comes from, read from its
module and class: `PyMuPDF4LLMLoader` from `langchain_pymupdf4llm` is tagged `LangChain`
and `PyMuPDF4LLM`, `PyPDFLoader` from `langchain_community` `LangChain` and `pypdf`, and a
LlamaIndex reader `LlamaIndex`. Parser presets declare their
tags, and hosted presets are also tagged `hosted`. Loaders from other modules get no
tags. The tags are in `LoaderSummary.tags` and `LoaderRun.tags`, in the `tags` column of
`report.to_pandas("loaders")`, and beside each loader's name in the HTML report.

## Baseline

The first loader is the baseline. The report's findings, readiness score,
global score, cost estimate and quick wins are built from its output;
`report.loader` is its run. The other loaders are measured against it.

## Text

Each document's `extractions` has one entry per loader that returned it, the
baseline first. `similarity` is how closely that loader's words match the
baseline's, in order, from 0 to 1. Where both loaders return page numbers it is
the lowest page's similarity, and a page only one loader returned counts as 0.
Where either loader returns no page numbers, the whole document's text is
compared.

`reordered` is true when every page that differed held the same words in a
different order.

With `extracted_text` on, the default, each page's `readings` holds the other
loaders' text for that page, and the Documents page of the HTML report marks
the words that differ. Documents without page numbers get readings only when
the baseline returned them as a single page.

## Identifiers

`report.loader_comparison.identifier_differences` lists identifiers found in
some loaders' output for a document and not in others'. Only loaders that
returned the document are compared on it.

An identifier is matched by where it was found (`text` or `metadata`), its
category and its masked value. Metadata findings are matched regardless of key,
so `producer` and `Producer` holding the same value are one identifier; the keys
are listed in `keys`.

Values are masked unless `reveal=True`. A difference in extracted text can also
change the masked form, for example when one loader drops the spaces inside a
number; that is reported as two differences.

## A folder of files

With `paths`, each loader is a callable taking a file path, such as a LangChain
loader class, and runs once per file:

```python title="compare_loaders_over_folder.py"
--8<-- "examples/compare_loaders_over_folder.py"
```

`paths` is a folder (searched as `complydoc audit` searches it), a file, or a list
of files. A file a loader raises on is recorded in its row's `failures` and the
report lists it as a limitation; the other files are still loaded.

## Expected facts

`facts` are passages the documents should contain, as strings or
`cd.Fact(text, document=...)`. Each is checked in every loader's text:

| Result | Meaning |
| --- | --- |
| `exact` | The passage appears, ignoring case, whitespace, invisible characters and words split at a line break |
| `fuzzy` | The most similar run of words scores at least `fact_threshold` (0.9 by default) |
| none | Not found |

Results are in `report.loader_comparison.facts`, each loader's count in
`facts_found`, and loaders that miss a fact are listed in the limitations.
`cd.check_facts(report, facts)` runs the same check on any report produced with
`extracted_text=True`.

## Parser presets

`complydoc.loaders.parsers` returns a `LoaderSpec` for each parser, used with `paths`:

| Preset | Library | Hosted | Price entry |
| --- | --- | --- | --- |
| `parsers.docling(export="markdown")` | `langchain-docling[local]` | no | `docling` |
| `parsers.unstructured(api=False)` | `langchain-unstructured` | when `api=True` | `unstructured_api` |
| `parsers.llamaparse(tier="cost_effective")` | `llama-parse` | yes | `llamaparse_<tier>` |
| `parsers.azure_document_intelligence(endpoint=..., api_key=...)` | `azure-ai-documentintelligence` | yes | `azure_read`, `azure_layout` |

The libraries are not dependencies; a preset reports what to install when its
library is missing. A hosted preset raises unless `allow_network=True`.

A preset's price comes from `parsers` in `pricing.yaml`. The comparison reports
`parser_usd`, the page count times the price per page. The shipped prices are not
verified, and the report says so for each one used.

## Other differences

| Field | Contents |
| --- | --- |
| `loaders` | Per loader: documents, pages, characters, load time, network, metadata keys, identifier counts, readiness and global scores, text-path cost |
| `metadata_keys` | Keys not returned by every loader, matched ignoring case, and which loaders returned them. A key spelled differently by different loaders is shown as `author / Author` |
| `documents` | Documents not returned by every loader, and which loaders returned them |

Documents are matched by the file named in their metadata, as described in
[grouping](inspect-a-loader.md#grouping-and-page-numbers).

## Limitations in the report

In addition to the baseline's own limitations, a comparison adds:

- which loader is the baseline
- the number of identifiers found by some loaders only, excluding low-severity
  findings from the name model
- documents not returned by every loader
- network attempts, failures and metadata findings from the other loaders

## From the command line

`complydoc compare-loaders FILE` runs a comparison described in YAML and writes
the same JSON and HTML report as `complydoc audit`:

```yaml title="loaders.yaml"
loaders:
  pymupdf4llm: langchain_pymupdf4llm:PyMuPDF4LLMLoader
  one-per-file:
    loader: langchain_pymupdf4llm:PyMuPDF4LLMLoader
    options: {mode: single}
  docling:
    preset: docling
    options: {export: markdown}
paths: ./contracts
facts:
  - Payment is due within thirty days
```

| Key | Default | Contents |
| --- | --- | --- |
| `loaders` | required | Two or more names mapped to `module:attribute`, or to `loader` or `preset` with keyword `options` |
| `paths` | required | A folder, a file or a list, relative to the YAML file |
| `facts` | none | Passages each loader's text should contain |
| `fact_threshold` | 0.9 | Fuzzy match threshold |
| `allow_network` | `false` | Let the loaders connect; the command prints a warning when set |
| `cache_dir` | none | Cache loader output between runs |
| `components` | all | `cost`, `readiness` and `sensitive` |
| `models` | all priced | Models to price |

The first loader is the baseline. A `loader` is called with each file path and its
`options`; a `preset` is one of the parser presets above. An invalid file, or a
loader that cannot be imported, exits with status 2.

## Which one to use

The comparison ends with a recommendation, on the command line and at the top of
the Loaders section at the top of the report's Documents page. Three things can decide it:

| What decided it | Example |
| --- | --- |
| Files a loader could not open | `Use pypdf, it opened all 9 documents; pdfplumber raised on 1` |
| An expected fact one loader kept | `Use pypdf, it kept 5 of 5 expected facts, pdfplumber kept 4` |
| Time, where the loaders read the same text | `Use pypdf, every loader read the same text and it was the quickest` |

Where the loaders read the same documents differently and no fact was given,
there is no recommendation, because nothing in the text says which reading is
right:

```
No recommendation — the loaders read 1 document differently and nothing here
says which reading is right. Pass a passage these documents contain, as a fact,
and the comparison can say which reading holds it.
```

A two-column page is the usual cause: one library walks the columns and another
reads straight across, and both return the same words. `facts` is what settles
it, which is why it is worth filling in.
