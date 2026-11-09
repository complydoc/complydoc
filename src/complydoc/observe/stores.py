"""What a vector database's client is given to store, as documents and their IDs.

A framework's vector store is given documents; a database's own client is given records
of its own: Qdrant's points, Chroma's parallel lists, Pinecone's vectors and records. Each
record is read as a document here, its text and the payload kept beside it, under the ID
it is stored by, so a client called directly is a store step as a framework's would be.

A record's text is the first of the fields a framework writes it under; the rest of the
payload is its metadata, which a store step scans as well, since it stays in the index
too. LangChain keeps the document's metadata in a field of its own, read as metadata.
"""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable, Mapping
from typing import Any, Final

__all__ = [
    "Given",
    "Reader",
    "chroma",
    "pinecone",
    "pinecone_records",
    "qdrant",
    "qdrant_collection",
]

Given = tuple[list[dict[str, Any]], list[str]]
"""The documents a client was given, and the ID each is stored under."""

Reader = Callable[[Callable[..., Any], tuple[Any, ...], dict[str, Any]], Given | None]

_TEXT: Final = ("page_content", "text", "document", "content", "chunk_text", "chunk")
"""Fields a record's text is kept under, by LangChain, LlamaIndex, Haystack and others."""

_IDS: Final = ("id", "_id")


def qdrant(
    function: Callable[..., Any], args: tuple[Any, ...], kwargs: dict[str, Any]
) -> Given | None:
    """`upsert(collection_name, points)` and `upload_points`: points, or a batch of them."""
    points = _arguments(function, args, kwargs).get("points")
    ids, payloads = getattr(points, "ids", None), getattr(points, "payloads", None)
    if isinstance(ids, list):
        # A `Batch`: the IDs, and the payloads beside them.
        return _given(ids, payloads if isinstance(payloads, list) else [None] * len(ids))
    if not isinstance(points, list | tuple):
        # An iterator is the caller's to read: it is not read here.
        return None
    return _given(
        [getattr(p, "id", None) for p in points], [getattr(p, "payload", None) for p in points]
    )


def qdrant_collection(
    function: Callable[..., Any], args: tuple[Any, ...], kwargs: dict[str, Any]
) -> Given | None:
    """`upload_collection(collection_name, vectors, payload, ids)`."""
    arguments = _arguments(function, args, kwargs)
    payloads, ids = arguments.get("payload"), arguments.get("ids")
    if not isinstance(payloads, list | tuple):
        return None
    return _given(
        list(ids) if isinstance(ids, list | tuple) else [None] * len(payloads), list(payloads)
    )


def chroma(
    function: Callable[..., Any], args: tuple[Any, ...], kwargs: dict[str, Any]
) -> Given | None:
    """`add(ids, embeddings, metadatas, documents)` and `upsert`: lists side by side."""
    arguments = _arguments(function, args, kwargs)
    ids = arguments.get("ids")
    ids = [ids] if isinstance(ids, str) else ids
    if not isinstance(ids, list | tuple):
        return None
    texts = _each(arguments.get("documents"), len(ids))
    metadatas = _each(arguments.get("metadatas"), len(ids))
    documents = [
        {"page_content": text if isinstance(text, str) else "", "metadata": dict(metadata or {})}
        for text, metadata in zip(texts, metadatas, strict=True)
    ]
    return documents, [str(i) for i in ids]


def pinecone(
    function: Callable[..., Any], args: tuple[Any, ...], kwargs: dict[str, Any]
) -> Given | None:
    """`upsert(vectors=...)`: `Vector`s, `(id, values, metadata)` tuples, or mappings."""
    vectors = _arguments(function, args, kwargs).get("vectors")
    if not isinstance(vectors, list | tuple):
        return None
    ids, payloads = [], []
    for vector in vectors:
        if isinstance(vector, tuple):
            ids.append(vector[0] if vector else None)
            payloads.append(vector[2] if len(vector) > 2 else None)
        elif isinstance(vector, Mapping):
            ids.append(vector.get("id"))
            payloads.append(vector.get("metadata"))
        else:
            ids.append(getattr(vector, "id", None))
            payloads.append(getattr(vector, "metadata", None))
    return _given(ids, payloads)


def pinecone_records(
    function: Callable[..., Any], args: tuple[Any, ...], kwargs: dict[str, Any]
) -> Given | None:
    """`upsert_records(namespace, records)`: each record its ID and its fields, one of which
    the index embeds."""
    records = _arguments(function, args, kwargs).get("records")
    if not isinstance(records, list | tuple) or not all(isinstance(r, Mapping) for r in records):
        return None
    ids = [next((r[k] for k in _IDS if r.get(k)), None) for r in records]
    payloads = [{k: v for k, v in r.items() if k not in _IDS} for r in records]
    return _given(ids, payloads)


def _given(ids: list[Any], payloads: list[Any]) -> Given:
    documents = [_document(payload) for payload in payloads]
    # Where any record has no ID of its own, none is named: an ID is never guessed.
    named = [str(i) for i in ids] if ids and all(i is not None for i in ids) else []
    return documents, named


def _document(payload: Any) -> dict[str, Any]:
    """A record's payload as a document: its text, and the rest as its metadata."""
    if not isinstance(payload, Mapping):
        return {"page_content": "", "metadata": {}}
    key = next((k for k in _TEXT if isinstance(payload.get(k), str)), None)
    metadata = {k: v for k, v in payload.items() if k != key}
    nested = metadata.pop("metadata", None)
    if isinstance(nested, Mapping):
        metadata = {**metadata, **nested}
    elif nested is not None:
        metadata["metadata"] = nested
    return {"page_content": payload[key] if key else "", "metadata": metadata}


def _each(values: Any, length: int) -> list[Any]:
    if isinstance(values, list | tuple) and len(values) == length:
        return list(values)
    return [None] * length


def _arguments(
    function: Callable[..., Any], args: tuple[Any, ...], kwargs: dict[str, Any]
) -> dict[str, Any]:
    """The call's arguments by name, however they were passed; `self` is left out."""
    try:
        bound = _signature(function).bind_partial(None, *args, **kwargs)
    except TypeError:
        return dict(kwargs)
    return dict(bound.arguments)


@functools.cache
def _signature(function: Callable[..., Any]) -> inspect.Signature:
    return inspect.signature(function)
