"""Which file types a loader is meant for.

A folder of PDFs, Word files and spreadsheets is read by different loaders for
each: `PyPDFLoader` for the PDFs, `Docx2txtLoader` for the Word files. Handing a
PDF loader a Word file only measures that it is not a Word loader, so in a
comparison each loader is given the files of its own types and skips the rest.

A loader's types come from, in order:

- `formats` passed to `compare_loaders`, or set on a loader in a comparison file;
- a parser preset's own `formats`;
- the class name, for loaders known to read one kind of file, such as
  `PyPDFLoader` or `Docx2txtLoader`.

A loader with none of these is given every file.
"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any

from complydoc.ingest.base import DocumentFormat

__all__ = [
    "FORMAT_LABELS",
    "extensions",
    "format_of",
    "loader_formats",
]

SUFFIX_FORMATS: dict[str, DocumentFormat] = {
    ".pdf": DocumentFormat.PDF,
    ".docx": DocumentFormat.DOCX,
    ".xlsx": DocumentFormat.XLSX,
    ".xlsm": DocumentFormat.XLSX,
    ".pptx": DocumentFormat.PPTX,
    ".html": DocumentFormat.HTML,
    ".htm": DocumentFormat.HTML,
    ".md": DocumentFormat.MARKDOWN,
    ".markdown": DocumentFormat.MARKDOWN,
    ".txt": DocumentFormat.TEXT,
    ".eml": DocumentFormat.EMAIL,
    ".png": DocumentFormat.IMAGE,
    ".jpg": DocumentFormat.IMAGE,
    ".jpeg": DocumentFormat.IMAGE,
    ".tif": DocumentFormat.IMAGE,
    ".tiff": DocumentFormat.IMAGE,
    ".bmp": DocumentFormat.IMAGE,
}
"""File extensions by the format complydoc reports them under."""

FORMAT_LABELS: dict[str, str] = {
    DocumentFormat.PDF: "PDF",
    DocumentFormat.DOCX: "Word",
    DocumentFormat.XLSX: "Excel",
    DocumentFormat.PPTX: "PowerPoint",
    DocumentFormat.HTML: "HTML",
    DocumentFormat.MARKDOWN: "Markdown",
    DocumentFormat.TEXT: "Text",
    DocumentFormat.EMAIL: "Email",
    DocumentFormat.IMAGE: "Image",
    DocumentFormat.OTHER: "Other",
}

PDF = (".pdf",)
WORD = (".docx",)
EXCEL = (".xlsx", ".xlsm")
POWERPOINT = (".pptx",)
HTML = (".html", ".htm")
MARKDOWN = (".md", ".markdown")
IMAGES = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp")

_KNOWN: dict[str, tuple[str, ...]] = {
    # LangChain
    "PyPDFLoader": PDF,
    "PDFPlumberLoader": PDF,
    "PyPDFium2Loader": PDF,
    "PyMuPDFLoader": PDF,
    "PDFMinerLoader": PDF,
    "OpenDataLoaderPDFLoader": PDF,
    "Docx2txtLoader": WORD,
    "UnstructuredPDFLoader": PDF,
    "UnstructuredWordDocumentLoader": WORD,
    "UnstructuredExcelLoader": EXCEL,
    "UnstructuredPowerPointLoader": POWERPOINT,
    "UnstructuredHTMLLoader": HTML,
    "BSHTMLLoader": HTML,
    "UnstructuredMarkdownLoader": MARKDOWN,
    "UnstructuredEmailLoader": (".eml",),
    "UnstructuredImageLoader": IMAGES,
    "TextLoader": (".txt", *MARKDOWN),
    # LlamaIndex
    "PDFReader": PDF,
    "DocxReader": WORD,
    "PptxReader": POWERPOINT,
    "HTMLTagReader": HTML,
    "MarkdownReader": MARKDOWN,
    "ImageReader": IMAGES,
}
"""Loader classes that read one kind of file, by class name."""


def extensions(values: Iterable[str]) -> tuple[str, ...]:
    """File extensions as `.pdf`: lower case, with the dot, each once.

    A format name stands for all its extensions: `pdf`, `docx`, `xlsx`, `pptx`,
    `html`, `markdown`, `text`, `email` or `image`.
    """
    if isinstance(values, str):
        values = [values]
    by_format: dict[str, list[str]] = {}
    for suffix, document_format in SUFFIX_FORMATS.items():
        by_format.setdefault(document_format.value, []).append(suffix)
    found: list[str] = []
    for value in values:
        text = str(value).strip().lower()
        if not text:
            continue
        named = by_format.get(text.lstrip("."))
        for suffix in named if named and not text.startswith(".") else [text]:
            suffix = suffix if suffix.startswith(".") else f".{suffix}"
            if suffix not in found:
                found.append(suffix)
    return tuple(found)


def format_of(path: str | Path) -> DocumentFormat:
    """The format a file is reported under, from its extension."""
    return SUFFIX_FORMATS.get(Path(path).suffix.lower(), DocumentFormat.OTHER)


def loader_formats(source: Any) -> tuple[str, ...] | None:
    """The extensions a loader, loader class, factory or preset is meant for.

    None when nothing says, and the loader is given every file.
    """
    from complydoc.loaders.origin import owner
    from complydoc.loaders.parsers import LoaderSpec

    if isinstance(source, LoaderSpec):
        return extensions(source.formats) if source.formats is not None else None
    return _KNOWN.get(getattr(owner(source), "__name__", ""))
