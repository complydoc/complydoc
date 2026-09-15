# Comparing loaders

`compare_loaders` runs several loaders on the same input and reports where their
output differs: the text, the identifiers found in it, the metadata, the
documents returned and the network connections attempted.

```python title="compare_langchain_loaders.py"
--8<-- "examples/compare_langchain_loaders.py"
```

## Input

`loaders` is either a mapping of names to loaders, or a sequence of loaders
named after their class. A second loader of the same class is named
`PyPDFLoader (2)`. Each entry is anything
[`inspect_documents`](inspect-a-loader.md#accepted-input) accepts, including a
list of documents already loaded.

At least two are required. Every loader runs with the same `config`,
`components`, `reveal`, `models` and `allow_network`.

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
| `parsers.docling(export="markdown")` | `langchain-docling` | no | `docling` |
| `parsers.unstructured(api=False)` | `langchain-unstructured` | when `api=True` | `unstructured_api` |
| `parsers.llamaparse(tier="cost_effective")` | `llama-parse` | yes | `llamaparse_<tier>` |
| `parsers.azure_document_intelligence(endpoint=..., api_key=...)` | `langchain-community` | yes | `azure_read`, `azure_layout` |

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
  pypdf: langchain_community.document_loaders:PyPDFLoader
  pdfplumber:
    loader: langchain_community.document_loaders:PDFPlumberLoader
    options: {extract_images: false}
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
