"""Where a loader's code comes from, shown as tags beside its name in reports.

Tags come from the loader's module and, for loaders known to wrap a library, from
its class name: `langchain_pymupdf4llm`'s `PyMuPDF4LLMLoader` is tagged `LangChain`
and `PyMuPDF4LLM`, and `langchain_community`'s `PyPDFLoader`, `LangChain` and
`pypdf`. Parser presets declare their own tags, and a preset that sends documents
to a hosted service is also tagged `hosted`. A loader from any other module gets
no tags.
"""

from __future__ import annotations

import functools
import inspect
from typing import Any

__all__ = ["loader_tags"]

_FRAMEWORKS: tuple[tuple[str, tuple[str, ...]], ...] = (
    # Ordered: the more specific module prefix first.
    ("langchain_unstructured", ("LangChain", "Unstructured")),
    ("langchain_docling", ("LangChain", "Docling")),
    ("langchain", ("LangChain",)),
    ("llama_parse", ("LlamaParse",)),
    ("llama_cloud_services", ("LlamaParse",)),
    ("llama_index", ("LlamaIndex",)),
    ("unstructured", ("Unstructured",)),
    ("docling", ("Docling",)),
)

_LIBRARIES = {
    # LangChain's standalone integration packages.
    "PyMuPDF4LLMLoader": "PyMuPDF4LLM",
    "OpenDataLoaderPDFLoader": "OpenDataLoader PDF",
    # `langchain-community`, archived in June 2026 and still in wide use.
    "PyPDFLoader": "pypdf",
    "PyPDFDirectoryLoader": "pypdf",
    "PDFPlumberLoader": "pdfplumber",
    "PyPDFium2Loader": "pypdfium2",
    "PyMuPDFLoader": "PyMuPDF",
    "PDFMinerLoader": "pdfminer",
    "Docx2txtLoader": "docx2txt",
    "UnstructuredFileLoader": "Unstructured",
    "UnstructuredPDFLoader": "Unstructured",
    "UnstructuredWordDocumentLoader": "Unstructured",
    "UnstructuredHTMLLoader": "Unstructured",
    "UnstructuredMarkdownLoader": "Unstructured",
    "AzureAIDocumentIntelligenceLoader": "Azure Document Intelligence",
    "PDFReader": "pypdf",
    "DocxReader": "docx2txt",
}
"""Loader classes that wrap one library, by class name."""


def _owner(source: Any) -> Any:
    """The class or function whose module says where `source` comes from."""
    while isinstance(source, functools.partial):
        source = source.func
    if inspect.ismethod(source):
        return type(source.__self__)
    if isinstance(source, type) or inspect.isfunction(source):
        return source
    return type(source)


def loader_tags(source: Any) -> list[str]:
    """Framework and library names for a loader, loader class, factory or preset."""
    from complydoc.loaders.inspection import FolderSource
    from complydoc.loaders.parsers import LoaderSpec

    if isinstance(source, LoaderSpec):
        declared = list(source.tags)
        if source.network and "hosted" not in declared:
            declared.append("hosted")
        return declared
    if isinstance(source, FolderSource):
        return list(source.tags) if source.tags else loader_tags(source.factory)

    owner = _owner(source)
    module = getattr(owner, "__module__", None) or ""
    tags: list[str] = []
    for prefix, names in _FRAMEWORKS:
        if module == prefix or module.startswith((f"{prefix}.", f"{prefix}_")):
            tags = list(names)
            break
    if not tags:
        return []
    library = _LIBRARIES.get(getattr(owner, "__name__", ""))
    if library and library not in tags:
        tags.append(library)
    return tags
