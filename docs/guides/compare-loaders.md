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
