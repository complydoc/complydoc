# Replacing a langchain-community loader

LangChain sunset `langchain-community` on 22 May 2026 and archived its repository
on 19 June ([the announcement](https://github.com/langchain-ai/langchain-community/issues/674)).
Its loaders now come as standalone packages, each kept by the people closest to
the library it wraps. They are still LangChain loaders: they build on
`langchain-core`, return LangChain `Document` objects and fit the same splitters
and vector stores. What changes is the import line, and sometimes what comes out.

`PyPDFLoader` and `PDFPlumberLoader` still install from the frozen 0.4.2 release,
with a deprecation warning and no further updates. Before switching, compare the
old loader and its replacement on your own documents.

## Where each loader went

| Library | Standalone package | Loader |
| --- | --- | --- |
| PyMuPDF | `langchain-pymupdf4llm` | `PyMuPDF4LLMLoader` |
| Docling | `langchain-docling[local]` | `DoclingLoader` |
| Unstructured | `langchain-unstructured` | `UnstructuredLoader` |
| OpenDataLoader PDF | `langchain-opendataloader-pdf` | `OpenDataLoaderPDFLoader` |
| pypdf, pdfplumber | none yet | `PyPDFLoader`, `PDFPlumberLoader` in `langchain-community` 0.4.2 |
| Azure Document Intelligence | none; `langchain-azure-ai` has no loader for it | complydoc's preset calls Azure's SDK |

PyMuPDF, and so `langchain-pymupdf4llm`, is licensed AGPL. complydoc does not
depend on it; check the licence before shipping it in your own product.

## Compare the old loader and the new one

```python title="compare_langchain_loaders.py"
--8<-- "examples/compare_langchain_loaders.py"
```

The first loader is the baseline, so put the one you have today first. Then look
at what your pipeline depends on:

- **Text**: how much of each page the two readings share, with the words that
  differ marked in the report.
- **Facts**: pass the sentences your retrieval has to find. Each is reported as
  kept whole, split or missing, per loader.
- **Identifiers**: any found in one loader's output and not the other's.
- **Metadata keys**: a filter or citation that reads a key the new loader does
  not return will stop matching.
- **Time and network**: load time per loader, and any connection one attempted.

From the command line, with the same comparison in a file:

```yaml title="loaders.yaml"
loaders:
  pypdf: langchain_community.document_loaders:PyPDFLoader
  pymupdf4llm: langchain_pymupdf4llm:PyMuPDF4LLMLoader
paths: ./contracts
facts:
  - Any change to the scope must be agreed in writing
```

```bash
complydoc compare-loaders loaders.yaml
complydoc ui
```

## What changes, on a two-column contract

Measured on `master-services-agreement.pdf` in the repository's
[sample documents](https://github.com/complydoc/complydoc/tree/main/viewer/sample/documents),
eight pages set in two columns:

| Loader | Words shared with pypdf | Section 7 on page 4 |
| --- | --- | --- |
| `PyPDFLoader` | baseline | Read column by column, heading on its own line |
| `PDFPlumberLoader` | 30% | Read across both columns: the heading lands mid-sentence in section 6 |
| `PyMuPDF4LLMLoader` | 46% | Read column by column, as Markdown: `# **7. Confidentiality**` |

PyMuPDF4LLM shares under half its words with pypdf because it rejoins each
paragraph and writes Markdown, not because it lost text: its character count is
within 2% of pypdf's, and a chunker that splits on headings now sees them. Its
metadata drops `page_label` and adds `file_path`, `format`, `creationDate` and
`modDate`. Both number pages from 0 in `page`.

## The presets

`cd.parsers.docling()` goes through `langchain-docling`, and needs its `local`
extra to convert on your machine. `cd.parsers.azure_document_intelligence()` used
`langchain-community`'s loader and now calls Azure's SDK,
`azure-ai-documentintelligence`, with the same request. In `mode="page"` it
reports Azure's page numbers, which start at 1, as `page_number`.
