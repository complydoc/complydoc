"""The library methods a `cd.observe` block wraps, and the wrapping.

LangChain's callbacks do not reach loaders or splitters, so the methods themselves are
wrapped instead. Base classes leave most of
these methods to their subclasses (`Embeddings.embed_documents` is abstract, and
most loaders define their own `lazy_load`), so each method is wrapped on every
loaded class that defines it. Wrapping is undone when the block ends.
"""

from __future__ import annotations

import functools
import importlib
import importlib.metadata
import inspect
import sys
from collections.abc import AsyncIterator, Callable, Iterator
from dataclasses import dataclass
from typing import Any, Final

from complydoc.observe import readers, session

__all__ = ["install", "uninstall"]

_OBSERVED: Final = "__complydoc_observed__"

_LAZY: Final = frozenset({"lazy_load", "lazy_load_data"})
"""Methods returning an iterator, whose stage lasts until the iterator is exhausted."""

_INPUT: Final = {
    "transform_documents": "documents",
    "atransform_documents": "documents",
    "split_documents": "documents",
    "create_documents": "texts",
    "embed_documents": "texts",
    "aembed_documents": "texts",
    "get_nodes_from_documents": "documents",
    "aget_nodes_from_documents": "documents",
    "get_text_embedding_batch": "texts",
    "aget_text_embedding_batch": "texts",
    "__call__": "nodes",
    "acall": "nodes",
    "add_documents": "documents",
    "aadd_documents": "documents",
    "add_texts": "texts",
    "aadd_texts": "texts",
    "add": "nodes",
    "async_add": "nodes",
    "from_documents": "documents",
    "afrom_documents": "documents",
    "from_texts": "texts",
    "afrom_texts": "texts",
}
"""The argument holding what a method is given, by method."""

_DONE: Final = object()


@dataclass(frozen=True, slots=True)
class _Target:
    module: str
    base: str
    methods: tuple[str, ...]
    kind: str
    distribution: str | None
    exclude: tuple[tuple[str, str], ...] = ()
    """Subclasses observed by another target, and so left alone by this one."""


_TARGETS: Final = (
    _Target(
        "langchain_core.document_loaders.base",
        "BaseLoader",
        ("load", "lazy_load", "aload", "alazy_load"),
        "load",
        "langchain-core",
    ),
    _Target(
        "langchain_core.documents.transformers",
        "BaseDocumentTransformer",
        ("transform_documents", "atransform_documents"),
        "transform",
        "langchain-core",
    ),
    _Target(
        "langchain_text_splitters.base",
        "TextSplitter",
        ("split_documents", "create_documents"),
        "split",
        "langchain-text-splitters",
    ),
    _Target(
        "langchain_core.embeddings",
        "Embeddings",
        ("embed_documents", "aembed_documents"),
        "embed",
        "langchain-core",
    ),
    # Where the documents are kept: what a store is given is what stays in the index.
    _Target(
        "langchain_core.vectorstores.base",
        "VectorStore",
        # The class methods build a store from documents, and many never call `add_texts`:
        # FAISS makes its index directly.
        (
            "add_documents",
            "aadd_documents",
            "add_texts",
            "aadd_texts",
            "from_documents",
            "afrom_documents",
            "from_texts",
            "afrom_texts",
        ),
        "store",
        "langchain-core",
    ),
    _Target("complydoc.pipeline.steps", "Step", ("transform_documents",), "transform", None),
    _Target(
        "llama_index.core.readers.base",
        "BaseReader",
        ("load_data", "lazy_load_data", "aload_data", "alazy_load_data"),
        "load",
        "llama-index-core",
    ),
    _Target(
        "llama_index.core.node_parser.interface",
        "NodeParser",
        ("get_nodes_from_documents", "aget_nodes_from_documents"),
        "split",
        "llama-index-core",
    ),
    # The texts a LlamaIndex embedding model is sent are each node's text with its metadata,
    # built inside `__call__`: they are seen where the batch is embedded.
    _Target(
        "llama_index.core.base.embeddings.base",
        "BaseEmbedding",
        ("get_text_embedding_batch", "aget_text_embedding_batch"),
        "embed",
        "llama-index-core",
    ),
    _Target(
        "llama_index.core.vector_stores.types",
        "BasePydanticVectorStore",
        ("add", "async_add"),
        "store",
        "llama-index-core",
    ),
    # Any other step of an ingestion pipeline, such as a metadata extractor.
    _Target(
        "llama_index.core.schema",
        "TransformComponent",
        ("__call__", "acall"),
        "transform",
        "llama-index-core",
        exclude=(
            ("llama_index.core.node_parser.interface", "NodeParser"),
            ("llama_index.core.base.embeddings.base", "BaseEmbedding"),
        ),
    ),
)

_installed: list[tuple[type, str, Any]] = []


def install() -> dict[str, str]:
    """Wrap every target method on every loaded class; return the libraries and versions."""
    libraries: dict[str, str] = {}
    splitter = _base("langchain_text_splitters.base", "TextSplitter")
    for target in _TARGETS:
        base = _base(target.module, target.base)
        if base is None:
            continue
        if target.distribution is not None:
            libraries[target.distribution] = _version(target.distribution)

        def kind_of(component: Any, kind: str = target.kind) -> str:
            # A text splitter is a document transformer; called either way, it splits.
            if kind == "transform" and splitter is not None and isinstance(component, splitter):
                return "split"
            return kind

        excluded = tuple(b for b in (_base(m, n) for m, n in target.exclude) if b is not None)
        for cls in (base, *_subclasses(base)):
            if excluded and issubclass(cls, excluded):
                continue
            for method in target.methods:
                original = cls.__dict__.get(method)
                if isinstance(original, classmethod) and _wrappable(original.__func__):
                    # Called on the class: the class is the component.
                    wrapped: Any = classmethod(_observed(original.__func__, method, kind_of))
                    setattr(cls, method, wrapped)
                    _installed.append((cls, method, original))
                    continue
                if not _wrappable(original):
                    continue
                setattr(cls, method, _observed(original, method, kind_of))
                _installed.append((cls, method, original))
    # Files read with a PDF library directly, not through a loader.
    libraries.update(readers.install())
    return libraries


def uninstall() -> None:
    """Put back every method `install` wrapped."""
    readers.uninstall()
    while _installed:
        cls, method, original = _installed.pop()
        setattr(cls, method, original)


def _base(module: str, name: str) -> type | None:
    # A library the program has not imported has no classes to observe, and importing it
    # here would cost the program the import (most of a second for LlamaIndex).
    if module.partition(".")[0] not in sys.modules:
        return None
    try:
        found = getattr(importlib.import_module(module), name, None)
    except ImportError:
        return None
    return found if isinstance(found, type) else None


def _version(distribution: str) -> str:
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


def _subclasses(base: type) -> list[type]:
    found: list[type] = []
    pending = list(base.__subclasses__())
    while pending:
        cls = pending.pop()
        if cls not in found:
            found.append(cls)
            pending.extend(cls.__subclasses__())
    return found


def _wrappable(function: Any) -> bool:
    return (
        inspect.isfunction(function)
        and not getattr(function, "__isabstractmethod__", False)
        and not getattr(function, _OBSERVED, False)
    )


def _inputs(method: str, args: tuple[Any, ...], kwargs: dict[str, Any]) -> Any:
    argument = _INPUT.get(method)
    if argument is None:
        return None
    return args[0] if args else kwargs.get(argument)


def _observed(original: Any, method: str, kind_of: Callable[[Any], str]) -> Any:
    """`original`, recording a stage each time it is called in a block and not in a stage."""

    def begin(self: Any, args: tuple[Any, ...], kwargs: dict[str, Any]) -> Any:
        # A class method's `self` is the class: it names the step, not its metaclass.
        on_class = isinstance(self, type)
        module = self.__module__ if on_class else type(self).__module__
        label = self.__name__ if on_class else None
        inputs = _inputs(method, args, kwargs)
        return session.begin(kind_of(self), self, module, method, inputs, label=label)

    if inspect.isasyncgenfunction(original):

        @functools.wraps(original)
        async def agenerator(self: Any, *args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            recording = None if session.idle() else begin(self, args, kwargs)
            if recording is None:
                async for item in original(self, *args, **kwargs):
                    yield item
                return
            recording.finished, recording.outputs = False, []
            iterator = original(self, *args, **kwargs)
            while True:
                with session.running(recording):
                    item = await anext(iterator, _DONE)
                if item is _DONE:
                    recording.finished = True
                    return
                recording.outputs.append(item)
                yield item

        wrapped: Any = agenerator

    elif inspect.iscoroutinefunction(original):

        @functools.wraps(original)
        async def coroutine(self: Any, *args: Any, **kwargs: Any) -> Any:
            recording = None if session.idle() else begin(self, args, kwargs)
            if recording is None:
                return await original(self, *args, **kwargs)
            with session.running(recording):
                result = await original(self, *args, **kwargs)
            session.finish(recording, result)
            return result

        wrapped = coroutine

    else:

        @functools.wraps(original)
        def function(self: Any, *args: Any, **kwargs: Any) -> Any:
            recording = None if session.idle() else begin(self, args, kwargs)
            if recording is None:
                return original(self, *args, **kwargs)
            if method in _LAZY:
                return _lazily(recording, lambda: original(self, *args, **kwargs))
            with session.running(recording):
                result = original(self, *args, **kwargs)
            session.finish(recording, result)
            return result

        wrapped = function

    setattr(wrapped, _OBSERVED, True)
    return wrapped


def _lazily(recording: session.Recording, start: Callable[[], Any]) -> Iterator[Any]:
    """Items as the caller takes them, the stage running only while one is being made."""
    recording.finished, recording.outputs = False, []
    with session.running(recording):
        iterator = iter(start())
    while True:
        with session.running(recording):
            item = next(iterator, _DONE)
        if item is _DONE:
            recording.finished = True
            return
        recording.outputs.append(item)
        yield item
