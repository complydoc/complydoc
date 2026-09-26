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
from complydoc.ingest.registry import suffix_formats

__all__ = [
    "FORMAT_LABELS",
    "extensions",
    "format_of",
    "loader_formats",
    "suffix_formats",
]

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

_KNOWN: dict[str, tuple[str, ...]] = {
    # LangChain
    "PyPDFLoader": ("pdf",),
    "PDFPlumberLoader": ("pdf",),
    "PyPDFium2Loader": ("pdf",),
    "PyMuPDFLoader": ("pdf",),
    "PDFMinerLoader": ("pdf",),
    "OpenDataLoaderPDFLoader": ("pdf",),
    "Docx2txtLoader": ("docx",),
    "UnstructuredPDFLoader": ("pdf",),
    "UnstructuredWordDocumentLoader": ("docx",),
    "UnstructuredExcelLoader": ("xlsx",),
    "UnstructuredPowerPointLoader": ("pptx",),
    "UnstructuredHTMLLoader": ("html",),
    "BSHTMLLoader": ("html",),
    "UnstructuredMarkdownLoader": ("markdown",),
    "UnstructuredEmailLoader": ("email",),
    "UnstructuredImageLoader": ("image",),
    "TextLoader": ("text", "markdown"),
    # LlamaIndex
    "PDFReader": ("pdf",),
    "DocxReader": ("docx",),
    "PptxReader": ("pptx",),
    "HTMLTagReader": ("html",),
    "MarkdownReader": ("markdown",),
    "ImageReader": ("image",),
}
"""Loader classes that read one kind of file, by class name, and the formats they read.

Formats rather than extensions, which come from complydoc's own readers."""


def extensions(values: Iterable[str]) -> tuple[str, ...]:
    """File extensions as `.pdf`: lower case, with the dot, each once.

    A format name stands for all its extensions: `pdf`, `docx`, `xlsx`, `pptx`,
    `html`, `markdown`, `text`, `email` or `image`.
    """
    if isinstance(values, str):
        values = [values]
    by_format: dict[str, list[str]] = {}
    for suffix, document_format in suffix_formats().items():
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
    return suffix_formats().get(Path(path).suffix.lower(), DocumentFormat.OTHER)


def loader_formats(source: Any) -> tuple[str, ...] | None:
    """The extensions a loader, loader class, factory or preset is meant for.

    None when nothing says, and the loader is given every file.
    """
    from complydoc.loaders.origin import owner
    from complydoc.loaders.parsers import LoaderSpec

    if isinstance(source, LoaderSpec):
        return extensions(source.formats) if source.formats is not None else None
    known = _KNOWN.get(getattr(owner(source), "__name__", ""))
    return extensions(known) if known is not None else None
