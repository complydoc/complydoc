# Report tables

A report renders as a summary in Jupyter, and each part of it is available as a
table.

```python title="report_tables.py"
--8<-- "examples/report_tables.py"
```

`report.to_pandas(table)` needs the `notebook` extra:

```bash
pip install 'complydoc[notebook]'
```

`complydoc.report.tables.table_rows(report, table)` returns the same rows as a list of
dictionaries and needs nothing installed.

| Table | One row per |
| --- | --- |
| `documents` | Document: format, pages, scores, identifier and hidden-passage counts |
| `pages` | Page of extracted text (requires `extracted_text=True`) |
| `identifiers` | Identifier found in text, masked |
| `signals` | Readiness signal per document |
| `hidden` | Hidden or instruction-like passage |
| `metadata` | Identifier found in loader metadata |
| `limitations` | Limitation of the run |
| `quick_wins` | Quick win |
| `loaders` | Loader in a `compare_loaders` report |
| `loader_formats` | Loader and file type in a `compare_loaders` report: what it read, failed on, or was not given |
| `differences` | Identifier found by some loaders only |
| `facts` | Expected fact per loader in a `compare_loaders` report |

Column names are listed in `complydoc.report.tables.COLUMNS`. An empty table keeps its
columns.
