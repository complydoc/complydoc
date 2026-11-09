"""What other libraries pass between steps, as the documents a trace reads.

A trace reads each step's items as text and metadata, the way LangChain documents,
LlamaIndex nodes, Haystack documents and Chonkie chunks already come. Docling, Unstructured
and Marker return objects of their own: a conversion's result holding a whole document, a
chunk with its provenance beside it, an element whose metadata is an object, a file's
Markdown. Each is turned into documents here, as the step is recorded; what the program
itself receives is left as it was.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any, Final

__all__ = ["documents_of", "listed", "vectors_of"]

_MARKER_PAGE: Final = re.compile(r"\n*\{(\d+)\}-{48}\n*")
"""Where Marker begins a page, when it is asked to paginate its Markdown."""

_VECTOR_TYPES: Final = ("float_", "float", "int8", "uint8", "binary", "ubinary")
"""The kinds of vector Cohere returns by type, the first one present read."""


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
    if module.startswith("marker"):
        if isinstance(getattr(item, "markdown", None), str):
            return _marker_pages(item.markdown)
        if isinstance(getattr(item, "html", None), str):
            return [{"page_content": item.html, "metadata": {}}]
    if module.startswith("chonkie") and isinstance(getattr(item, "chunks", None), list):
        # A Chonkie document: its chunks once it is chunked, its text until then.
        if item.chunks:
            return list(item.chunks)
        content = getattr(item, "content", None)
        if isinstance(content, str):
            return [
                {"page_content": content, "metadata": dict(getattr(item, "metadata", None) or {})}
            ]
    if module.startswith("google.genai") and isinstance(getattr(item, "parts", None), list):
        # Content sent to Gemini: the text of its parts.
        texts = [p.text for p in item.parts if isinstance(getattr(p, "text", None), str)]
        return ["\n".join(texts)]
    if isinstance(item, list) and _batch(item):
        # A batch: Chonkie's `chunk_batch` returns the chunks of each text.
        return [document for inner in item for document in documents_of(inner)]
    return [item]


def _batch(items: list[Any]) -> bool:
    """A list of documents, not a row of values: `(document, score)` is one item, not two."""
    from complydoc.loaders.inspection import is_document_like

    return bool(items) and all(is_document_like(item) for item in items)


def listed(value: Any) -> list[Any] | None:
    """What a step was given or returned, as documents; None where it is not a list of
    them, nor one of the objects above standing for some."""
    if isinstance(value, list | tuple):
        return [document for item in value for document in documents_of(item)]
    if value is None or isinstance(value, str):
        return None
    if isinstance(value, Mapping) and isinstance(value.get("documents"), list):
        # What a Haystack component returns: its documents, by the socket's name.
        return listed(value["documents"])
    documents = documents_of(value)
    return None if documents == [value] else documents


def vectors_of(result: Any) -> tuple[int, int | None] | None:
    """How many vectors an embedding call returned, and their length, however its library
    holds them: a list, an array, or a provider's response."""
    shape = getattr(result, "shape", None)
    if isinstance(shape, tuple) and len(shape) in (1, 2) and all(isinstance(n, int) for n in shape):
        # An array or a tensor, as sentence-transformers returns them: one text gives one row.
        return (1 if len(shape) == 1 else shape[0]), shape[-1]
    vectors = _vectors(result)
    if vectors is None:
        return None
    first = vectors[0] if vectors else None
    first = getattr(first, "embedding", first)
    size = getattr(first, "shape", None)
    if isinstance(size, tuple) and size:
        return len(vectors), size[-1]
    return len(vectors), len(first) if isinstance(first, list | tuple) else None


def _vectors(result: Any) -> list[Any] | None:
    if isinstance(result, list | tuple):
        return list(result)
    if isinstance(result, Mapping) and isinstance(result.get("documents"), list):
        # A Haystack document embedder: the documents, each with its embedding set.
        return [getattr(d, "embedding", None) for d in result["documents"]]
    data = getattr(result, "data", None)
    if isinstance(data, list) and all(hasattr(item, "embedding") for item in data):
        # OpenAI and Mistral: a response whose data holds an embedding a text.
        return [item.embedding for item in data]
    held = getattr(result, "embeddings", None)
    if held is not None and not isinstance(held, list):
        # Cohere by type: the vectors of each type asked for.
        held = next(
            (v for v in (getattr(held, t, None) for t in _VECTOR_TYPES) if isinstance(v, list)),
            None,
        )
    if isinstance(held, list):
        # Voyage and Cohere: the vectors; Gemini: an embedding a text, holding its values.
        return [getattr(vector, "values", vector) for vector in held]
    return None


def _marker_pages(markdown: str) -> list[dict[str, Any]]:
    """A file Marker converted: one document, or a document a page where it was asked to
    paginate, numbered from 0 as Marker numbers them."""
    parts = _MARKER_PAGE.split(markdown)
    if len(parts) == 1:
        return [{"page_content": markdown, "metadata": {}}]
    pages = zip(parts[1::2], parts[2::2], strict=True)
    return [{"page_content": text, "metadata": {"page": int(n)}} for n, text in pages]


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
