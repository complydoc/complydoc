"""What other libraries pass between steps, as the documents a trace reads.

A trace reads each step's items as text and metadata, the way LangChain documents and
LlamaIndex nodes already come. Docling and Unstructured return objects of their own: a
conversion's result holding a whole document, a chunk with its provenance beside it, an
element whose metadata is an object. Each is turned into documents here, as the step is
recorded; what the program itself receives is left as it was.
"""

from __future__ import annotations

from typing import Any

__all__ = ["documents_of", "listed"]


def documents_of(item: Any) -> list[Any]:
    """`item` as the documents a trace reads: one a page for a Docling document, one for a
    Docling chunk or an Unstructured element, and anything else as it is."""
    module = type(item).__module__
    if module.startswith("docling"):
        document = getattr(item, "document", None)
        if document is not None and hasattr(document, "export_to_markdown"):
            # A conversion's result: the document it holds, from the file it read.
            source = getattr(getattr(item, "input", None), "file", None)
            return _docling_pages(document, str(source) if source is not None else None)
        if hasattr(item, "export_to_markdown") and hasattr(item, "pages"):
            return _docling_pages(item, None)
        meta = getattr(item, "meta", None)
        if isinstance(getattr(item, "text", None), str) and meta is not None:
            return [_docling_chunk(item.text, meta)]
    if module.startswith("unstructured"):
        metadata = getattr(item, "metadata", None)
        to_dict = getattr(metadata, "to_dict", None)
        if isinstance(getattr(item, "text", None), str) and callable(to_dict):
            return [{"page_content": item.text, "metadata": dict(to_dict())}]
    return [item]


def listed(value: Any) -> list[Any] | None:
    """What a step was given or returned, as documents; None where it is not a list of
    them, nor one of the objects above standing for some."""
    if isinstance(value, list | tuple):
        return [document for item in value for document in documents_of(item)]
    if value is None or isinstance(value, str):
        return None
    documents = documents_of(value)
    return None if documents == [value] else documents


def _docling_pages(document: Any, source: str | None) -> list[dict[str, Any]]:
    """A Docling document as LangChain's loaders give a PDF: a document a page, in order.

    Docling exports one page by walking the whole document, so a page at a time costs as
    much again as the conversion on a long book. The items are walked once instead, each
    put on the page it came from: its text, or a table as Markdown.
    """
    origin = getattr(getattr(document, "origin", None), "filename", None)
    name = source or origin or getattr(document, "name", None)
    numbers = sorted(getattr(document, "pages", None) or {})
    walk = getattr(document, "iterate_items", None)
    if not numbers or not callable(walk):
        return [{"page_content": document.export_to_markdown(), "metadata": _named(name)}]
    texts: dict[int, list[str]] = {number: [] for number in numbers}
    for entry in walk():
        item = entry[0] if isinstance(entry, tuple) else entry
        page = _page_of(item)
        if page is None:
            continue
        text = _text_of(item, document)
        if text:
            texts.setdefault(page, []).append(text)
    return [
        {
            "page_content": "\n\n".join(texts[number]),
            "metadata": {**_named(name), "page_number": number},
        }
        for number in sorted(texts)
    ]


def _page_of(item: Any) -> int | None:
    places = getattr(item, "prov", None) or []
    number = getattr(places[0], "page_no", None) if places else None
    return number if isinstance(number, int) else None


def _text_of(item: Any, document: Any) -> str:
    """An item's text; a table's as Markdown, as a whole-document export writes it."""
    if type(item).__name__ == "TableItem" and hasattr(item, "export_to_markdown"):
        try:
            return str(item.export_to_markdown(doc=document)).strip()
        except TypeError:
            return str(item.export_to_markdown()).strip()
    text = getattr(item, "text", None)
    return text.strip() if isinstance(text, str) else ""


def _docling_chunk(text: str, meta: Any) -> dict[str, Any]:
    """A Docling chunk, with its provenance where Docling's LangChain loader puts it."""
    export = getattr(meta, "export_json_dict", None)
    exported = export() if callable(export) else {}
    origin = getattr(getattr(meta, "origin", None), "filename", None)
    return {"page_content": text, "metadata": {**_named(origin), "dl_meta": exported}}


def _named(source: str | None) -> dict[str, Any]:
    return {"source": source} if source else {}
