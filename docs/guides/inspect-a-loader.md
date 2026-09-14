# Inspecting a loader's output

`inspect_documents` runs a loader, or takes the documents a loader already
returned, and reports on that output: the identifier scan, the readiness signals,
the cost estimate, the metadata attached to each document, and any network
connection the loader attempted.

```python title="inspect_a_langchain_loader.py"
--8<-- "examples/inspect_a_langchain_loader.py"
```

The HTML report adds a **Loader** section to the summary and, on the security
tab, the identifiers found in metadata and the keys holding file paths.

## Accepted input

Documents are read by shape; no framework is imported.

| Shape | Text | Metadata |
| --- | --- | --- |
| LangChain `Document` | `page_content` | `metadata` |
| LlamaIndex `Document` | `text` | `metadata` |
| Mapping | `page_content` or `text` | `metadata`, optional |
| `str` | the string | none |

`source` may be a loader (anything with `load()`, `load_data()` or
`lazy_load()`), a callable returning documents, a list of documents, or a single
document. A path is rejected; use `full_audit` for files on disk.

## Grouping and page numbers

Documents are grouped by `source`, `file_path`, `filename` or `file_name`,
whichever is present first.

Within a group, `page_number` is used as given and `page` is read as zero-based,
which is what LangChain's PDF loaders emit. Documents with the same page number
are merged into one page. A group with no page numbers gets one page per
document, and its page count is reported as unknown.

## What is not measured

Loader output carries text and metadata and no page geometry. These are
reported as not measured:

- text layer coverage, column count, tables, rotation, skew, scan resolution and
  OCR confidence
- whether the file has a text layer — the text's source is recorded as `loader`
- vision cost

The readiness score is computed from the signals that remain, and states how
many that was.

## Metadata

Every metadata value is scanned with the same detectors and validators as page
text. Each distinct key and value is scanned once per document, and values with
fewer than four alphanumeric characters are skipped.

Findings that are both low severity and detected by the name model — typically
the producing software labelled as an organisation — are listed but do not
raise a limitation or a quick win.

Keys whose value is an absolute filesystem path are listed separately in
`document.path_exposures`.

Measured on `sample/employee-record.pdf` and `sample/supplier-list.docx`:

| Loader | Documents | `page` | Metadata keys |
| --- | --- | --- | --- |
| `PyPDFLoader` | one per page | zero-based | `author`, `creationdate`, `creator`, `keywords`, `moddate`, `page`, `page_label`, `producer`, `source`, `subject`, `title`, `total_pages`, `trapped` |
| `PDFPlumberLoader` | one per page | zero-based | `Author`, `CreationDate`, `Creator`, `Keywords`, `ModDate`, `Producer`, `Subject`, `Title`, `Trapped`, `file_path`, `page`, `source`, `total_pages` |
| `Docx2txtLoader` | one per file | absent | `source` |

## Network access

A loader runs inside the network guard. Connections it attempts are refused and
recorded in `report.loader.network_attempts`, including when the loader catches
the refusal and continues. A loader that fails because a connection was refused
produces a report with no documents and the reason in `report.loader.error`.
Any other exception from the loader is raised.

### Loaders that use the network

A loader that calls a hosted service needs `allow_network=True`:

```python
report = cd.inspect_documents(loader, allow_network=True)
```

With the flag set:

- the loader's connections go through, and each DNS lookup and connection is
  recorded in `report.loader.network_attempts`
- `report.loader.network_allowed` is `true`
- the report's limitations state that network access was allowed, and, if the
  loader connected, that document content may have left the machine
- scanning, scoring and report assembly still run behind the guard, and
  `report.run.offline_guard` is `armed`

The flag applies to the loader call only. Documents passed in already loaded
make no calls, so for them the flag records nothing.
