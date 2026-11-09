"""The library methods a `cd.observe` block wraps, and the wrapping.

LangChain's callbacks do not reach loaders or splitters, so the methods themselves are
wrapped instead. Base classes leave most of these methods to their subclasses
(`Embeddings.embed_documents` is abstract, and most loaders define their own `lazy_load`),
so each method is wrapped on every loaded class that defines it, and on each class a
library defines as it is imported inside the block. Haystack's components share a
metaclass rather than a base class, so for Haystack it is every class the metaclass made.
Wrapping is undone when the block ends.
"""

from __future__ import annotations

import contextlib
import functools
import importlib
import importlib.abc
import importlib.metadata
import inspect
import os
import sys
from collections.abc import AsyncIterator, Callable, Iterator
from dataclasses import dataclass
from typing import Any, Final

from complydoc.loaders.inspection import SOURCE_KEYS
from complydoc.observe import adapters, functions, haystack, readers, session, stores

__all__ = ["install", "uninstall"]

_OBSERVED: Final = "__complydoc_observed__"

_LAZY: Final = frozenset({"lazy_load", "lazy_load_data", "convert_all", "chunk"})
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
    "chunk": "dl_doc",
    "create": "input",
    "run": "documents",
    "run_async": "documents",
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
    label: str | None = None
    """The step's name, where the class's own would not say what it is."""
    arguments: tuple[str, ...] = ()
    """The arguments holding what a method is given, where `_INPUT`'s for the method is not
    it: the first passed by name, or else the first passed."""
    reads: stores.Reader | None = None
    """Reads a database client's records as documents and their IDs."""
    made_by: bool = False
    """The base is a metaclass: the classes observed are those it made, each of the kind
    `haystack.kind_of` says, and none it says is no step."""


_QDRANT: Final = (
    ("qdrant_client.qdrant_client", "QdrantClient"),
    ("qdrant_client.async_qdrant_client", "AsyncQdrantClient"),
)

_PINECONE: Final = (
    ("pinecone.index", "Index"),
    ("pinecone.async_client.async_index", "AsyncIndex"),
    ("pinecone.grpc", "GrpcIndex"),
    ("pinecone.db_data.index", "Index"),
    ("pinecone.db_data.index_asyncio", "_IndexAsyncio"),
    ("pinecone.grpc.index_grpc", "GRPCIndex"),
    ("pinecone.data.index", "Index"),
)
"""Where Pinecone's index classes are, over HTTP, async and gRPC, in its releases since 5."""


def _at(
    places: tuple[tuple[str, str], ...],
    methods: tuple[str, ...],
    kind: str,
    distribution: str,
    **fields: Any,
) -> tuple[_Target, ...]:
    """The same methods observed on each of several classes: a client and its async twin,
    or one class where each of a library's releases has kept it."""
    return tuple(
        _Target(module, base, methods, kind, distribution, **fields) for module, base in places
    )


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
    # Docling read directly: a converter reads files, a chunker splits what it read.
    _Target(
        "docling.document_converter",
        "DocumentConverter",
        ("convert", "convert_all"),
        "load",
        "docling",
    ),
    _Target(
        "docling_core.transforms.chunker.base",
        "BaseChunker",
        ("chunk",),
        "split",
        "docling-core",
    ),
    # An embedding model called through its provider's own SDK, not a framework's class.
    _Target(
        "openai.resources.embeddings",
        "Embeddings",
        ("create",),
        "embed",
        "openai",
        label="OpenAI embeddings",
    ),
    _Target(
        "openai.resources.embeddings",
        "AsyncEmbeddings",
        ("create",),
        "embed",
        "openai",
        label="OpenAI embeddings",
    ),
    *_at(
        (("cohere.client", "Client"), ("cohere.client", "AsyncClient")),
        ("embed",),
        "embed",
        "cohere",
        label="Cohere embeddings",
        arguments=("texts",),
    ),
    *_at(
        (("cohere.v2.client", "V2Client"), ("cohere.v2.client", "AsyncV2Client")),
        ("embed",),
        "embed",
        "cohere",
        label="Cohere embeddings",
        arguments=("texts",),
    ),
    *_at(
        (("voyageai.client", "Client"), ("voyageai.client_async", "AsyncClient")),
        ("embed",),
        "embed",
        "voyageai",
        label="Voyage embeddings",
        arguments=("texts",),
    ),
    # Mistral's SDK moved its code under `client` in its second major version.
    *_at(
        (("mistralai.client.embeddings", "Embeddings"), ("mistralai.embeddings", "Embeddings")),
        ("create", "create_async"),
        "embed",
        "mistralai",
        label="Mistral embeddings",
        arguments=("inputs",),
    ),
    *_at(
        (("google.genai.models", "Models"), ("google.genai.models", "AsyncModels")),
        ("embed_content",),
        "embed",
        "google-genai",
        label="Gemini embeddings",
        arguments=("contents",),
    ),
    # A model run on this machine: `encode_document` calls `encode`, and is one step.
    _Target(
        "sentence_transformers",
        "SentenceTransformer",
        ("encode", "encode_document"),
        "embed",
        "sentence-transformers",
        arguments=("inputs", "sentences"),
    ),
    # A database's own client, called directly rather than through a framework's store.
    *_at(
        _QDRANT,
        ("upsert", "upload_points"),
        "store",
        "qdrant-client",
        reads=stores.qdrant,
    ),
    *_at(_QDRANT, ("upload_collection",), "store", "qdrant-client", reads=stores.qdrant_collection),
    *_at(
        (
            ("chromadb.api.models.Collection", "Collection"),
            ("chromadb.api.models.AsyncCollection", "AsyncCollection"),
        ),
        ("add", "upsert"),
        "store",
        "chromadb",
        label="Chroma collection",
        reads=stores.chroma,
    ),
    *_at(
        _PINECONE, ("upsert",), "store", "pinecone", label="Pinecone index", reads=stores.pinecone
    ),
    *_at(
        _PINECONE,
        ("upsert_records",),
        "store",
        "pinecone",
        label="Pinecone index",
        reads=stores.pinecone_records,
    ),
    # Chonkie's chunkers, given a text: `__call__` and `chunk_batch` call `chunk`.
    _Target(
        "chonkie.chunker.base",
        "BaseChunker",
        ("chunk", "chunk_batch", "__call__", "achunk", "achunk_batch", "chunk_document"),
        "split",
        "chonkie",
        arguments=("text", "texts", "document"),
    ),
    # Marker's converters, called with the file to convert.
    _Target("marker.converters", "BaseConverter", ("__call__",), "load", "marker-pdf"),
    # Haystack's components, as `Pipeline.run` calls them or as they are run alone.
    _Target(
        "haystack.core.component.component",
        "ComponentMeta",
        ("run", "run_async"),
        "haystack",
        "haystack-ai",
        made_by=True,
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

_PDF_LIBRARIES: Final = frozenset({"pypdf", "pymupdf", "fitz"})
"""Libraries whose own wrapping is `readers`'."""

_installed: list[tuple[type, str, Any]] = []
_attached: dict[_Target, type] = {}
"""The targets whose base class is loaded, with that class."""
_pending: list[_Target] = []
"""The targets whose base class is not loaded yet."""
_libraries: dict[str, str] = {}
_finder: _LateImports | None = None


def install() -> dict[str, str]:
    """Wrap every target method on every loaded class; return the libraries and versions.

    A library the program imports only once the block has begun, as a function that imports
    what it uses does, is wrapped as it arrives: the returned libraries gain it then.
    """
    global _finder
    _libraries.clear()
    _attached.clear()
    _pending.clear()
    for target in _TARGETS:
        if not _attach(target):
            _pending.append(target)
    # Files read with a PDF library directly, not through a loader.
    _libraries.update(readers.install())
    # Functions a program calls by name, as Unstructured's partitioners.
    _libraries.update(functions.install())
    _finder = _LateImports()
    sys.meta_path.insert(0, _finder)
    return _libraries


def uninstall() -> None:
    """Put back every method `install` wrapped."""
    global _finder
    if _finder is not None:
        _finder.active = False
        if _finder in sys.meta_path:
            sys.meta_path.remove(_finder)
        _finder = None
    _attached.clear()
    _pending.clear()
    readers.uninstall()
    functions.uninstall()
    while _installed:
        cls, method, original = _installed.pop()
        setattr(cls, method, original)


def _attach(target: _Target) -> bool:
    """Wrap `target` on its base class and every subclass loaded; False if not loaded."""
    base = _base(target.module, target.base)
    if base is None:
        return False
    _attached[target] = base
    if target.distribution is not None:
        _libraries[target.distribution] = _version(target.distribution)
    classes = haystack.components(base) if target.made_by else [base, *_subclasses(base)]
    for cls in classes:
        _wrap_class(cls, target)
    return True


def _kind_of(kind: str) -> Callable[[Any], str]:
    def kind_of(component: Any) -> str:
        # A text splitter is a document transformer; called either way, it splits.
        if kind == "transform":
            splitter = _base("langchain_text_splitters.base", "TextSplitter")
            if splitter is not None and isinstance(component, splitter):
                return "split"
        return kind

    return kind_of


def _wrap_class(cls: type, target: _Target) -> None:
    excluded = tuple(b for b in (_base(m, n) for m, n in target.exclude) if b is not None)
    if excluded and issubclass(cls, excluded):
        return
    kind = haystack.kind_of(cls) if target.made_by else target.kind
    if kind is None:
        return
    kind_of = _kind_of(kind)
    for method in target.methods:
        original = cls.__dict__.get(method)
        if isinstance(original, classmethod) and _wrappable(original.__func__):
            # Called on the class: the class is the component.
            wrapped: Any = classmethod(_observed(original.__func__, method, kind_of, target))
            setattr(cls, method, wrapped)
            _installed.append((cls, method, original))
            continue
        if not _wrappable(original):
            continue
        setattr(cls, method, _observed(original, method, kind_of, target))
        _installed.append((cls, method, original))


def _imported(module: Any) -> None:
    """A module has just finished importing inside the block: wrap what it brings."""
    name = getattr(module, "__name__", "")
    for target in tuple(_pending):
        if name == target.module and _attach(target):
            _pending.remove(target)
    defined = [
        cls for cls in vars(module).values() if isinstance(cls, type) and cls.__module__ == name
    ]
    for target, base in _attached.items():
        for cls in defined:
            if isinstance(cls, base) if target.made_by else issubclass(cls, base):
                _wrap_class(cls, target)
    if name in _PDF_LIBRARIES:
        _libraries.update(readers.install())
    _libraries.update(functions.imported(module))


class _LateImports(importlib.abc.MetaPathFinder):
    """Finds nothing itself; has each module imported from here on reported when it is done."""

    def __init__(self) -> None:
        self.active = True

    def find_spec(self, name: str, path: Any = None, target: Any = None) -> Any:
        for finder in sys.meta_path:
            if finder is self or not hasattr(finder, "find_spec"):
                continue
            spec = finder.find_spec(name, path, target)
            if spec is None:
                continue
            loader = spec.loader
            execute = getattr(loader, "exec_module", None)
            if execute is None:
                return spec

            def exec_module(module: Any, execute: Any = execute) -> None:
                execute(module)
                if self.active:
                    # The program's import stands whatever happens here.
                    with contextlib.suppress(Exception):
                        _imported(module)

            with contextlib.suppress(AttributeError, TypeError):
                loader.exec_module = exec_module  # type: ignore[union-attr,method-assign]
            return spec
        return None


def _base(module: str, name: str) -> type | None:
    # A module the program has not imported defines no classes to observe, and importing it
    # here would cost the program the import (most of a second for LlamaIndex). The module
    # itself, not its package: `google` is loaded by protobuf, and `google.genai` is not.
    if module not in sys.modules:
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


def _inputs(
    method: str, kind: str, names: tuple[str, ...], args: tuple[Any, ...], kwargs: dict[str, Any]
) -> Any:
    # A load is given files, not documents: what it passed on is what it read.
    if kind == "load":
        return None
    names = names or ((_INPUT[method],) if method in _INPUT else ())
    if not names:
        return None
    named = next((kwargs[n] for n in names if n in kwargs), None)
    given = named if named is not None or not args else args[0]
    # An embedding call or a chunker takes one text as readily as a list of them.
    if isinstance(given, str) and kind in ("embed", "split"):
        return [given]
    return adapters.listed(given)


def _observed(original: Any, method: str, kind_of: Callable[[Any], str], target: _Target) -> Any:
    """`original`, recording a stage each time it is called in a block and not in a stage."""

    def begin(self: Any, args: tuple[Any, ...], kwargs: dict[str, Any]) -> Any:
        # A class method's `self` is the class: it names the step, not its metaclass.
        on_class = isinstance(self, type)
        module = self.__module__ if on_class else type(self).__module__
        label = target.label or (self.__name__ if on_class else None)
        kind = kind_of(self)
        given = target.reads(original, args, kwargs) if target.reads is not None else None
        inputs = (
            given[0] if given is not None else _inputs(method, kind, target.arguments, args, kwargs)
        )
        recording = session.begin(kind, self, module, method, inputs, label=label)
        # A model named in the call, as an SDK takes it, prices the call as a setting would.
        if recording is not None and kind == "embed" and isinstance(kwargs.get("model"), str):
            recording.parameters["model"] = kwargs["model"]
        # IDs given to a store, as `from_documents(..., ids=...)` takes them: a store built
        # by a class method returns itself, not the IDs.
        ids = given[1] if given is not None and given[1] else kwargs.get("ids")
        if recording is not None and kind == "store" and isinstance(ids, list | tuple):
            recording.ids = [str(i) for i in ids]
        return recording

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
                recording.outputs.extend(adapters.documents_of(item))
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
            _finish(recording, result, args)
            return result

        wrapped = coroutine

    else:

        @functools.wraps(original)
        def function(self: Any, *args: Any, **kwargs: Any) -> Any:
            recording = None if session.idle() else begin(self, args, kwargs)
            if recording is None:
                return original(self, *args, **kwargs)
            if method in _LAZY:
                with session.running(recording):
                    result = original(self, *args, **kwargs)
                # Most return an iterator, read as the caller takes from it; one that
                # returns a list has done its work, and the caller gets the list itself.
                if isinstance(result, list | tuple):
                    session.finish(recording, result)
                    return result
                return _lazily(recording, result)
            with session.running(recording):
                result = original(self, *args, **kwargs)
            _finish(recording, result, args)
            return result

        wrapped = function

    setattr(wrapped, _OBSERVED, True)
    return wrapped


def _finish(recording: session.Recording, result: Any, args: tuple[Any, ...]) -> None:
    """Keep what the stage returned. A file read whole, as Marker reads one, gives text that
    does not say where it came from; the file the stage was called with does."""
    session.finish(recording, result)
    path = args[0] if args else None
    if recording.kind != "load" or not isinstance(path, str | os.PathLike) or not recording.outputs:
        return
    recording.outputs = [
        {**document, "metadata": {**document.get("metadata", {}), "source": os.fspath(path)}}
        if isinstance(document, dict) and not _named(document)
        else document
        for document in recording.outputs
    ]


def _named(document: dict[str, Any]) -> bool:
    metadata = document.get("metadata") or {}
    return any(metadata.get(key) for key in SOURCE_KEYS)


def _lazily(recording: session.Recording, returned: Any) -> Iterator[Any]:
    """Items as the caller takes them, the stage running only while one is being made."""
    recording.finished, recording.outputs = False, []
    with session.running(recording):
        iterator = iter(returned)
    while True:
        with session.running(recording):
            item = next(iterator, _DONE)
        if item is _DONE:
            recording.finished = True
            return
        recording.outputs.extend(adapters.documents_of(item))
        yield item
