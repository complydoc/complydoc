"""`cd.observe` on libraries read directly: parsers, chunkers, embedding SDKs, Haystack and
vector databases' own clients.

Docling, Unstructured, Marker, sentence-transformers and Pinecone are large installs or need
a service, so they are stood in for here by classes and functions of the same shape, in
modules of the same names. The embedding SDKs are used for real, against a server on this
machine; Haystack, Chonkie, Qdrant and Chroma are used for real where they are installed.
"""

from __future__ import annotations

import asyncio
import contextlib
import importlib.util
import inspect
import json
import sys
import threading
import types
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, ClassVar

import pytest

import complydoc as cd

IBAN = "GB29 NWBK 6016 1331 9268 19"


def _module(monkeypatch: pytest.MonkeyPatch, name: str, **members: Any) -> types.ModuleType:
    module = types.ModuleType(name)
    for key, value in members.items():
        setattr(module, key, value)
        if isinstance(value, type) or inspect.isfunction(value):
            value.__module__ = name
    monkeypatch.setitem(sys.modules, name, module)
    return module


class _Origin:
    def __init__(self, filename: str) -> None:
        self.filename = filename


class _Document:
    """Docling's document: pages, and its text as Markdown, a page at a time or whole."""

    def __init__(self, filename: str, pages: list[str]) -> None:
        self.origin = _Origin(filename)
        self.pages = {number: object() for number in range(1, len(pages) + 1)}
        self._pages = pages

    def export_to_markdown(self, page_no: int | None = None) -> str:
        return "\n\n".join(self._pages) if page_no is None else self._pages[page_no - 1]

    def iterate_items(self) -> Iterator[tuple[_Item, int]]:
        for number, text in enumerate(self._pages, start=1):
            yield _Item(text, number), 1


class _Place:
    def __init__(self, page_no: int) -> None:
        self.page_no = page_no


class _Item:
    """A paragraph of a Docling document, and the page it is on."""

    def __init__(self, text: str, page: int) -> None:
        self.text = text
        self.prov = [_Place(page)]


class _Input:
    def __init__(self, file: Path) -> None:
        self.file = file


class _Result:
    """What Docling's converter returns for each file."""

    def __init__(self, path: Path, pages: list[str]) -> None:
        self.input = _Input(path)
        self.document = _Document(path.name, pages)


class _Meta:
    def __init__(self, filename: str, page: int) -> None:
        self.origin = _Origin(filename)
        self._page = page

    def export_json_dict(self) -> dict[str, Any]:
        return {"doc_items": [{"prov": [{"page_no": self._page}]}]}


class _Chunk:
    def __init__(self, text: str, meta: _Meta) -> None:
        self.text = text
        self.meta = meta


PAGES = [f"Payments go to account {IBAN} every month.", "Termination needs thirty days notice."]


@pytest.fixture
def docling(monkeypatch: pytest.MonkeyPatch) -> types.SimpleNamespace:
    """Docling's converter and a chunker, in the modules Docling keeps them in."""

    class DocumentConverter:
        def convert(self, source: Path) -> _Result:
            return _Result(Path(source), PAGES)

        def convert_all(self, sources: list[Path]) -> Iterator[_Result]:
            for source in sources:
                yield self.convert(source)

    class BaseChunker:
        def chunk(self, dl_doc: _Document) -> Iterator[_Chunk]:
            raise NotImplementedError

    class HybridChunker(BaseChunker):
        def chunk(self, dl_doc: _Document) -> Iterator[_Chunk]:
            for number in sorted(dl_doc.pages):
                text = dl_doc.export_to_markdown(page_no=number)
                yield _Chunk(text, _Meta(dl_doc.origin.filename, number))

    for name in (
        "docling",
        "docling_core",
        "docling_core.transforms",
        "docling_core.transforms.chunker",
    ):
        _module(monkeypatch, name)
    _module(monkeypatch, "docling.document_converter", DocumentConverter=DocumentConverter)
    _module(monkeypatch, "docling.datamodel.document", _Result=_Result, _Document=_Document)
    _module(
        monkeypatch,
        "docling_core.transforms.chunker.base",
        BaseChunker=BaseChunker,
        HybridChunker=HybridChunker,
    )
    _module(monkeypatch, "docling_core.transforms.chunker.doc_chunk", _Chunk=_Chunk)
    return types.SimpleNamespace(converter=DocumentConverter, chunker=HybridChunker)


def test_docling_read_directly_is_a_load_and_a_split(docling, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    with cd.observe("docling", out=None) as observation:
        chunks = []
        for result in docling.converter().convert_all([tmp_path / "contract.pdf"]):
            chunks += list(docling.chunker().chunk(result.document))
    # What the program was given is Docling's own, untouched.
    assert isinstance(chunks[0], _Chunk)

    load, split = observation.report.trace.stages
    assert (load.kind, load.component, split.kind, split.component) == (
        "load",
        "DocumentConverter",
        "split",
        "HybridChunker",
    )
    # One document a page, as LangChain's loaders give a PDF, named by the file read.
    assert load.documents_out == 2 and load.sources == ["contract.pdf"]
    assert split.documents_in == 2 and split.documents_out == 2
    assert [i.label for i in load.identifiers] == ["IBAN"]
    document = observation.report.documents[0]
    assert document.page_count == 2


def test_one_conversion_is_a_load_of_its_pages(docling, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    with cd.observe("docling", out=None) as observation:
        docling.converter().convert(tmp_path / "contract.pdf")
        list(docling.converter().convert_all([tmp_path / "contract.pdf"]))
    one, many = observation.report.trace.stages
    # A converter is given files, not documents: as for any loader, nothing comes in.
    assert one.documents_in == many.documents_in
    assert one.documents_out == 2 and one.characters_out == sum(len(p) for p in PAGES)
    assert one.sources == many.sources == ["contract.pdf"]


def test_a_chunker_that_returns_a_list_still_returns_a_list(docling) -> None:  # type: ignore[no-untyped-def]
    class ListChunker(docling.chunker.__mro__[1]):  # type: ignore[misc,name-defined]
        def chunk(self, dl_doc: _Document) -> list[_Chunk]:  # type: ignore[override]
            return [_Chunk(dl_doc.export_to_markdown(), _Meta(dl_doc.origin.filename, 1))]

    document = _Document("contract.pdf", PAGES)
    with cd.observe("docling", out=None) as observation:
        chunks = ListChunker().chunk(document)
    assert isinstance(chunks, list) and len(chunks) == 1
    (split,) = observation.report.trace.stages
    assert split.documents_out == 1


class _Metadata:
    def __init__(self, filename: str) -> None:
        self.filename = filename

    def to_dict(self) -> dict[str, Any]:
        return {"filename": self.filename}


class _Element:
    """An Unstructured element: its text, and its metadata as an object."""

    def __init__(self, text: str, filename: str) -> None:
        self.text = text
        self.metadata = _Metadata(filename)


def test_unstructured_elements_pass_through_a_step_of_your_own(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _module(monkeypatch, "unstructured.documents.elements", _Element=_Element)

    @cd.stage("partition", kind="load")
    def partition(filename: str) -> list[_Element]:
        return [_Element(PAGES[0], filename), _Element(PAGES[1], filename)]

    @cd.stage("chunk_by_title", kind="split")
    def chunk_by_title(elements: list[_Element]) -> list[_Element]:
        return [_Element(" ".join(e.text for e in elements), elements[0].metadata.filename)]

    with cd.observe("unstructured", out=None) as observation:
        chunk_by_title(partition("contract.docx"))
    load, split = observation.report.trace.stages
    assert load.documents_out == 2 and load.sources == ["contract.docx"]
    assert split.documents_in == 2 and split.documents_out == 1
    assert [i.label for i in split.identifiers] == ["IBAN"]


class _Embeddings(BaseHTTPRequestHandler):
    """Each provider's embeddings endpoint, answered as it answers: a vector of eight
    numbers a text. OpenAI, Mistral and Voyage share a shape; Cohere and Gemini have their
    own."""

    def do_POST(self) -> None:
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        vector = [0.1] * 8
        if self.path.endswith(":batchEmbedContents"):
            answer: dict[str, Any] = {"embeddings": [{"values": vector}] * len(body["requests"])}
        elif self.path.startswith("/v2/embed"):
            answer = {
                "response_type": "embeddings_by_type",
                "id": "1",
                "texts": body["texts"],
                "embeddings": {"float": [vector] * len(body["texts"])},
            }
        elif self.path.startswith("/v1/embed") and "texts" in body:
            answer = {
                "response_type": "embeddings_floats",
                "id": "1",
                "texts": body["texts"],
                "embeddings": [vector] * len(body["texts"]),
            }
        else:
            texts = body["input"] if isinstance(body["input"], list) else [body["input"]]
            answer = {
                "id": "1",
                "object": "list",
                "model": body["model"],
                "usage": {"prompt_tokens": 1, "total_tokens": 1},
                "data": [
                    {"object": "embedding", "index": i, "embedding": vector}
                    for i in range(len(texts))
                ],
            }
        data = json.dumps(answer)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data.encode())

    def log_message(self, *args: Any) -> None:
        pass


@pytest.fixture
def provider() -> Iterator[str]:
    """The address of a server standing in for each embedding provider."""
    server = HTTPServer(("127.0.0.1", 0), _Embeddings)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()


def _cohere(url: str) -> None:
    cohere = pytest.importorskip("cohere")
    cohere.Client(api_key="test", base_url=url).embed(
        texts=PAGES, model="embed-english-v3.0", input_type="search_document"
    )


def _cohere_v2(url: str) -> None:
    cohere = pytest.importorskip("cohere")
    cohere.ClientV2(api_key="test", base_url=url).embed(
        texts=PAGES, model="embed-v4.0", input_type="search_document", embedding_types=["float"]
    )


def _voyage(url: str) -> None:
    voyageai = pytest.importorskip("voyageai")
    voyageai.Client(api_key="test", base_url=url).embed(PAGES, model="voyage-3.5")


def _voyage_async(url: str) -> None:
    voyageai = pytest.importorskip("voyageai")
    asyncio.run(voyageai.AsyncClient(api_key="test", base_url=url).embed(PAGES, model="voyage-3.5"))


def _mistral(url: str) -> None:
    pytest.importorskip("mistralai")
    try:
        from mistralai.client import Mistral
    except ImportError:
        from mistralai import Mistral  # type: ignore[attr-defined,no-redef]
    Mistral(api_key="test", server_url=url).embeddings.create(model="mistral-embed", inputs=PAGES)


def _gemini(url: str) -> None:
    genai = pytest.importorskip("google.genai")
    client = genai.Client(api_key="test", http_options={"base_url": url})
    client.models.embed_content(model="gemini-embedding-001", contents=PAGES)


def _gemini_async(url: str) -> None:
    genai = pytest.importorskip("google.genai")
    client = genai.Client(api_key="test", http_options={"base_url": url})
    asyncio.run(client.aio.models.embed_content(model="gemini-embedding-001", contents=PAGES))


@pytest.mark.parametrize(
    ("call", "component", "model"),
    [
        (_cohere, "Cohere embeddings", "embed-english-v3.0"),
        (_cohere_v2, "Cohere embeddings", "embed-v4.0"),
        (_voyage, "Voyage embeddings", "voyage-3.5"),
        (_voyage_async, "Voyage embeddings", "voyage-3.5"),
        (_mistral, "Mistral embeddings", "mistral-embed"),
        (_gemini, "Gemini embeddings", "gemini-embedding-001"),
        (_gemini_async, "Gemini embeddings", "gemini-embedding-001"),
    ],
    ids=["cohere", "cohere-v2", "voyage", "voyage-async", "mistral", "gemini", "gemini-async"],
)
def test_each_providers_sdk_is_an_embedding_step(
    provider: str, call: Any, component: str, model: str
) -> None:
    with cd.observe("sdk", out=None) as observation:
        call(provider)
    (step,) = observation.report.trace.stages
    assert (step.kind, step.component, step.parameters["model"]) == ("embed", component, model)
    assert (step.documents_in, step.vectors, step.dimensions) == (2, 2, 8)
    assert step.hosts == ["127.0.0.1"] and [i.label for i in step.identifiers] == ["IBAN"]
    # Each provider's model is in the price table.
    assert step.usd is not None and step.usd_basis == "estimated"


def test_an_embedding_sdk_called_directly_is_an_embedding_step() -> None:
    openai = pytest.importorskip("openai")
    server = HTTPServer(("127.0.0.1", 0), _Embeddings)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        client = openai.OpenAI(api_key="test", base_url=f"http://127.0.0.1:{server.server_port}/v1")
        with cd.observe("sdk", out=None) as observation:
            client.embeddings.create(model="text-embedding-3-small", input=[PAGES[0], PAGES[1]])
            client.embeddings.create(model="text-embedding-3-small", input="one text alone")
    finally:
        server.shutdown()

    first, second = observation.report.trace.stages
    assert (first.kind, first.component) == ("embed", "OpenAI embeddings")
    assert first.parameters["model"] == "text-embedding-3-small"
    assert (first.documents_in, first.vectors, first.dimensions) == (2, 2, 8)
    assert first.hosts == ["127.0.0.1"] and [i.label for i in first.identifiers] == ["IBAN"]
    # Priced from the model the call named, as a framework's settings would name it.
    assert first.usd is not None and first.usd_basis == "estimated"
    assert (second.documents_in, second.vectors) == (1, 1)


def test_an_async_embedding_sdk_call_is_an_embedding_step() -> None:
    openai = pytest.importorskip("openai")
    server = HTTPServer(("127.0.0.1", 0), _Embeddings)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    async def embed() -> None:
        client = openai.AsyncOpenAI(
            api_key="test", base_url=f"http://127.0.0.1:{server.server_port}/v1"
        )
        await client.embeddings.create(model="text-embedding-3-small", input=[PAGES[0]])

    try:
        with cd.observe("sdk", out=None) as observation:
            asyncio.run(embed())
    finally:
        server.shutdown()
    (step,) = observation.report.trace.stages
    assert (step.kind, step.component, step.vectors, step.dimensions) == (
        "embed",
        "OpenAI embeddings",
        1,
        8,
    )
    assert step.hosts == ["127.0.0.1"] and [i.label for i in step.identifiers] == ["IBAN"]


def test_a_result_that_only_looks_like_a_response_is_not_read_as_one() -> None:
    """A framework's own result with a `data` field is not an SDK's response."""
    from complydoc.observe import session

    class Batch(list):  # type: ignore[type-arg]
        data: ClassVar[list[list[float]]] = [[0.0] * 3]

    recording = session.Recording(
        index=0,
        kind="embed",
        component="x",
        module="m",
        method="embed_documents",
        tags=[],
        parameters={},
    )
    session.finish(recording, Batch([[0.0] * 4, [0.0] * 4]))
    assert (recording.vectors, recording.dimensions) == (2, 4)


def test_a_haystack_pipeline_is_a_step_a_component(tmp_path: Path) -> None:
    pytest.importorskip("haystack")
    from haystack import Pipeline
    from haystack.components.converters import TextFileToDocument
    from haystack.components.preprocessors import DocumentCleaner, DocumentSplitter
    from haystack.components.writers import DocumentWriter
    from haystack.document_stores.in_memory import InMemoryDocumentStore

    from complydoc.integrations.haystack import as_component

    path = tmp_path / "contract.txt"
    path.write_text(f"{PAGES[0]}\n\n{PAGES[1]}")
    store = InMemoryDocumentStore()
    pipeline = Pipeline()
    pipeline.add_component("convert", TextFileToDocument())
    pipeline.add_component("clean", DocumentCleaner())
    pipeline.add_component("split", DocumentSplitter(split_by="sentence", split_length=1))
    pipeline.add_component("mask", as_component(cd.MaskIdentifiers()))
    pipeline.add_component("write", DocumentWriter(store))
    pipeline.connect("convert", "clean")
    pipeline.connect("clean", "split")
    pipeline.connect("split", "mask")
    pipeline.connect("mask", "write")

    with cd.observe("haystack", out=None) as observation:
        pipeline.run({"convert": {"sources": [path]}})
    stages = observation.report.trace.stages
    assert [(s.kind, s.component) for s in stages] == [
        ("load", "TextFileToDocument"),
        ("transform", "DocumentCleaner"),
        ("split", "DocumentSplitter"),
        ("transform", "MaskIdentifiers"),
        ("store", "DocumentWriter"),
    ]
    load, _, split, mask, write = stages
    assert load.sources == ["contract.txt"] and [i.label for i in load.identifiers] == ["IBAN"]
    assert split.documents_out == 2 and [i.label for i in split.identifiers] == ["IBAN"]
    assert mask.identifiers == [] and write.vectors == 2
    # Haystack keeps a document under its own ID, and the step names it.
    assert sorted(write.ids) == sorted(d.id for d in store.filter_documents())
    assert IBAN not in " ".join(d.content or "" for d in store.filter_documents())


def test_a_step_as_a_haystack_component_keeps_each_document_s_id() -> None:
    pytest.importorskip("haystack")
    from haystack import Document

    from complydoc.integrations.haystack import as_component

    document = Document(content=PAGES[0], meta={"file_path": "contract.pdf"})
    (masked,) = as_component(cd.MaskIdentifiers()).run(documents=[document])["documents"]
    assert IBAN not in (masked.content or "") and masked.id == document.id
    assert masked.meta == {"file_path": "contract.pdf"}


def test_a_haystack_document_with_no_text_keeps_none() -> None:
    pytest.importorskip("haystack")
    from haystack import Document
    from haystack.dataclasses import ByteStream

    from complydoc.integrations.haystack import as_component

    document = Document(blob=ByteStream(b"%PDF-1.7"), meta={"file_path": "/home/jane/a.pdf"})
    (cleaned,) = as_component(cd.StripPathMetadata()).run(documents=[document])["documents"]
    assert cleaned.content is None and cleaned.meta == {"file_path": "a.pdf"}


def test_chonkie_chunkers_are_split_steps() -> None:
    chonkie = pytest.importorskip("chonkie")
    chunker = chonkie.RecursiveChunker(chunk_size=256)
    with cd.observe("chonkie", out=None) as observation:
        chunker(PAGES[0])
        chunker.chunk_batch(PAGES, show_progress=False)
    one, batch = observation.report.trace.stages
    # `__call__` calls `chunk`, and `chunk_batch` calls it for each text: each is one step.
    assert (one.kind, one.component, one.method) == ("split", "RecursiveChunker", "__call__")
    assert (one.documents_in, one.documents_out) == (1, 1)
    assert (batch.documents_in, batch.documents_out) == (2, 2)
    assert [i.label for i in batch.identifiers] == ["IBAN"]


def test_a_qdrant_client_called_directly_is_a_store_step() -> None:
    qdrant_client = pytest.importorskip("qdrant_client")
    from qdrant_client.http import models

    client = qdrant_client.QdrantClient(location=":memory:")
    client.create_collection(
        "contracts", vectors_config=models.VectorParams(size=4, distance=models.Distance.COSINE)
    )
    points = [
        models.PointStruct(id=i, vector=[0.1] * 4, payload={"text": t, "source": "a.pdf"})
        for i, t in enumerate(PAGES)
    ]
    # LangChain's payload: the text, and the document's metadata in a field of its own.
    batch = models.Batch(
        ids=[7],
        vectors=[[0.1] * 4],
        payloads=[{"page_content": "Thirty days.", "metadata": {"source": "b.pdf", "iban": IBAN}}],
    )
    with cd.observe("qdrant", out=None) as observation:
        client.upsert("contracts", points=points)
        client.upsert("contracts", points=batch)
    points_step, batch_step = observation.report.trace.stages
    assert (points_step.kind, points_step.component) == ("store", "QdrantClient")
    assert (points_step.documents_in, points_step.vectors, points_step.ids) == (2, 2, ["0", "1"])
    assert points_step.sources == ["a.pdf"]
    assert [(i.label, i.items) for i in points_step.identifiers] == [("IBAN", [0])]
    # A value in the metadata stays in the index as surely as one in the text.
    assert batch_step.ids == ["7"] and batch_step.sources == ["b.pdf"]
    assert [i.label for i in batch_step.identifiers] == ["IBAN"]


def test_a_chroma_collection_called_directly_is_a_store_step() -> None:
    chromadb = pytest.importorskip("chromadb")
    collection = chromadb.EphemeralClient().get_or_create_collection("contracts")
    with cd.observe("chroma", out=None) as observation:
        collection.add(
            ids=["a", "b"],
            documents=PAGES,
            metadatas=[{"source": "contract.pdf"}] * 2,
            embeddings=[[0.1] * 4] * 2,
        )
    (step,) = observation.report.trace.stages
    assert (step.kind, step.component, step.method) == ("store", "Chroma collection", "add")
    assert (step.documents_in, step.vectors, step.ids) == (2, 2, ["a", "b"])
    assert step.sources == ["contract.pdf"]
    assert [(i.label, i.items) for i in step.identifiers] == [("IBAN", [0])]


def test_one_chroma_record_given_on_its_own_is_read_whole() -> None:
    chromadb = pytest.importorskip("chromadb")
    collection = chromadb.EphemeralClient().get_or_create_collection("one-record")
    with cd.observe("chroma", out=None) as observation:
        collection.add(
            ids="a",
            documents=PAGES[0],
            metadatas={"source": "contract.pdf"},
            embeddings=[[0.1] * 4],
        )
    (step,) = observation.report.trace.stages
    assert (step.documents_in, step.vectors, step.ids) == (1, 1, ["a"])
    assert step.sources == ["contract.pdf"] and [i.label for i in step.identifiers] == ["IBAN"]


def test_a_pinecone_index_is_a_store_step(monkeypatch: pytest.MonkeyPatch) -> None:
    class Vector:
        def __init__(self, id: str, values: list[float], metadata: dict[str, Any]) -> None:
            self.id, self.values, self.metadata = id, values, metadata

    class Index:
        def upsert(self, *, vectors: list[Any], namespace: str = "") -> dict[str, int]:
            return {"upserted_count": len(vectors)}

        def upsert_records(self, namespace: str, records: list[dict[str, Any]]) -> None:
            return None

    _module(monkeypatch, "pinecone")
    _module(monkeypatch, "pinecone.index", Index=Index)
    index = Index()
    with cd.observe("pinecone", out=None) as observation:
        index.upsert(
            vectors=[
                ("a", [0.1], {"text": PAGES[0], "source": "contract.pdf"}),
                {"id": "b", "values": [0.1], "metadata": {"text": PAGES[1]}},
                Vector("c", [0.1], {"text": "Signed.", "source": "contract.pdf"}),
            ]
        )
        index.upsert_records("contracts", [{"_id": "d", "chunk_text": PAGES[0]}])
    vectors, records = observation.report.trace.stages
    assert (vectors.kind, vectors.component) == ("store", "Pinecone index")
    assert (vectors.vectors, vectors.ids) == (3, ["a", "b", "c"])
    assert [(i.label, i.items) for i in vectors.identifiers] == [("IBAN", [0])]
    assert records.ids == ["d"] and [i.label for i in records.identifiers] == ["IBAN"]


def test_marker_reads_a_file_as_a_document_a_page(monkeypatch: pytest.MonkeyPatch) -> None:
    class MarkdownOutput:
        def __init__(self, markdown: str) -> None:
            self.markdown, self.images, self.metadata = markdown, {}, {}

    class BaseConverter:
        def __call__(self, *args: Any, **kwargs: Any) -> Any:
            raise NotImplementedError

    class PdfConverter(BaseConverter):
        def __call__(self, filepath: str) -> MarkdownOutput:
            pages = "".join(f"\n\n{{{n}}}{'-' * 48}\n\n{text}" for n, text in enumerate(PAGES))
            return MarkdownOutput(pages)

    _module(monkeypatch, "marker")
    _module(monkeypatch, "marker.renderers.markdown", MarkdownOutput=MarkdownOutput)
    _module(monkeypatch, "marker.converters", BaseConverter=BaseConverter)
    _module(monkeypatch, "marker.converters.pdf", PdfConverter=PdfConverter)
    with cd.observe("marker", out=None) as observation:
        rendered = PdfConverter()("contract.pdf")
    (load,) = observation.report.trace.stages
    assert (load.kind, load.component, load.documents_out) == ("load", "PdfConverter", 2)
    # Named by the file it was given, as Marker's Markdown does not say.
    assert load.sources == ["contract.pdf"] and [i.label for i in load.identifiers] == ["IBAN"]
    assert isinstance(rendered, MarkdownOutput)


class _Array:
    """What sentence-transformers returns: an array, a row a text."""

    def __init__(self, rows: int, size: int) -> None:
        self.shape = (rows, size) if rows else (size,)


def test_a_sentence_transformer_is_a_local_embedding_step(monkeypatch: pytest.MonkeyPatch) -> None:
    class SentenceTransformer:
        def encode(self, inputs: Any, batch_size: int = 32) -> _Array:
            return _Array(0 if isinstance(inputs, str) else len(inputs), 384)

        def encode_document(self, inputs: Any) -> _Array:
            return self.encode(inputs)

    _module(monkeypatch, "sentence_transformers", SentenceTransformer=SentenceTransformer)
    model = SentenceTransformer()
    with cd.observe("local", out=None) as observation:
        model.encode_document(PAGES)
        model.encode(PAGES[0])
    documents, one = observation.report.trace.stages
    # `encode_document` calls `encode`: one step.
    assert (documents.kind, documents.method) == ("embed", "encode_document")
    assert (documents.documents_in, documents.vectors, documents.dimensions) == (2, 2, 384)
    assert (one.vectors, one.dimensions) == (1, 384)
    assert documents.usd == 0.0 and documents.usd_basis == "local"


@pytest.fixture
def unstructured(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> types.ModuleType:
    """Unstructured's partitioners and a chunker, and a program of the caller's own that
    imports them by name before the block opens."""

    def partition_pdf(filename: str, strategy: str = "fast") -> list[_Element]:
        return [_Element(text, Path(filename).name) for text in PAGES]

    def partition(filename: str) -> list[_Element]:
        return sys.modules["unstructured.partition.pdf"].partition_pdf(filename=filename)

    def chunk_by_title(elements: list[_Element], max_characters: int = 500) -> list[_Element]:
        return [_Element(" ".join(e.text for e in elements), elements[0].metadata.filename)]

    for name in ("unstructured", "unstructured.partition", "unstructured.chunking"):
        _module(monkeypatch, name)
    _module(monkeypatch, "unstructured.documents.elements", _Element=_Element)
    _module(monkeypatch, "unstructured.partition.pdf", partition_pdf=partition_pdf)
    _module(monkeypatch, "unstructured.partition.auto", partition=partition)
    _module(monkeypatch, "unstructured.chunking.title", chunk_by_title=chunk_by_title)

    source = tmp_path / "ingest.py"
    source.write_text(
        "from unstructured.chunking.title import chunk_by_title\n"
        "from unstructured.partition.auto import partition\n"
        "from unstructured.partition.pdf import partition_pdf\n\n"
        "def run(path):\n"
        "    return chunk_by_title(partition_pdf(path, strategy='hi_res'), max_characters=200)\n"
    )
    spec = importlib.util.spec_from_file_location("ingest", source)
    assert spec is not None and spec.loader is not None
    program = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "ingest", program)
    spec.loader.exec_module(program)
    return program


def test_unstructured_functions_imported_by_name_are_steps(unstructured: types.ModuleType) -> None:
    original = unstructured.partition_pdf
    with cd.observe("unstructured", out=None) as observation:
        unstructured.run("contract.pdf")
        unstructured.partition("contract.pdf")
    load, split, auto = observation.report.trace.stages
    assert (load.kind, load.component, load.documents_out) == ("load", "partition_pdf", 2)
    assert load.parameters == {"filename": "contract.pdf", "strategy": "hi_res"}
    assert load.sources == ["contract.pdf"] and [i.label for i in load.identifiers] == ["IBAN"]
    assert (split.kind, split.component) == ("split", "chunk_by_title")
    assert (split.documents_in, split.documents_out) == (2, 1)
    assert split.parameters == {"max_characters": 200}
    # `partition` calls `partition_pdf`: one step.
    assert (auto.component, auto.documents_out, auto.parent) == ("partition", 2, None)
    assert "unstructured" in observation.report.trace.libraries
    # Put back where the program holds it, and where Unstructured defines it.
    assert unstructured.partition_pdf is original
    assert sys.modules["unstructured.partition.pdf"].partition_pdf is original


def test_haystack_s_tracer_makes_a_step_of_each_component_a_pipeline_runs() -> None:
    pytest.importorskip("haystack")
    from haystack import Document, Pipeline, component, tracing
    from haystack.components.preprocessors import DocumentSplitter

    # Sockets declared, not annotated: this file's annotations are strings, which Haystack
    # cannot connect.
    @component
    class Deduplicate:
        """A component of the program's own, given documents."""

        def __init__(self) -> None:
            component.set_input_type(self, "documents", list[Document])

        @component.output_types(documents=list[Document])
        def run(self, **inputs: Any) -> dict[str, list[Document]]:
            return {"documents": list({d.content.strip(): d for d in inputs["documents"]}.values())}

    @component
    class Broken:
        def __init__(self) -> None:
            component.set_input_type(self, "documents", list[Document])

        @component.output_types(documents=list[Document])
        def run(self, **inputs: Any) -> dict[str, list[Document]]:
            raise RuntimeError("the index is down")

    class Recorder(tracing.Tracer):  # type: ignore[misc]
        """A tracer of the program's own, as Langfuse's would be."""

        def __init__(self) -> None:
            self.spans: list[str] = []
            self.tags: list[str] = []

        @contextlib.contextmanager
        def trace(
            self, operation_name: str, tags: dict[str, Any] | None = None, parent_span: Any = None
        ) -> Iterator[Any]:
            self.spans.append(operation_name)
            recorder = self

            class Span(tracing.Span):  # type: ignore[misc]
                def set_tag(self, key: str, value: Any) -> None:
                    recorder.tags.append(key)

            yield Span()

        def current_span(self) -> Any:
            return None

    pipeline = Pipeline()
    pipeline.add_component("split", DocumentSplitter(split_by="sentence", split_length=1))
    pipeline.add_component("dedupe", Deduplicate())
    pipeline.connect("split", "dedupe")
    broken = Pipeline()
    broken.add_component("write", Broken())
    documents = [Document(content=f"{PAGES[0]} {PAGES[0]}")]

    recorder = Recorder()
    tracing.enable_tracing(recorder)
    try:
        with cd.observe("haystack", out=None) as observation:
            pipeline.run({"split": {"documents": documents}})
            DocumentSplitter(split_by="word", split_length=4).run(documents=documents)
            with pytest.raises(Exception, match="the index is down"):
                broken.run({"write": {"documents": documents}})
        assert tracing.tracer.actual_tracer is recorder
    finally:
        tracing.disable_tracing()

    split, dedupe, alone, failed = observation.report.trace.stages
    assert (split.kind, split.component, split.documents_out) == ("split", "DocumentSplitter", 2)
    # The span does not carry the component's settings; its `run` gives them.
    assert split.parameters["split_by"] == "sentence" and split.parameters["split_length"] == 1
    # A component of the program's own is a step where it is given documents.
    assert (dedupe.kind, dedupe.component, dedupe.documents_out) == ("transform", "Deduplicate", 1)
    # Run alone, a component opens no span, and is a step all the same.
    assert (alone.component, alone.parameters["split_by"]) == ("DocumentSplitter", "word")
    assert failed.error is not None and "the index is down" in failed.error
    # The program's tracer saw every span, and no content: content tracing is off.
    assert recorder.spans.count("haystack.component.run") == 3
    assert "haystack.component.input" not in recorder.tags


def test_a_load_s_path_names_only_marker_s_documents() -> None:
    """A loader given a folder reads many files: the folder is not each one's source."""
    pytest.importorskip("langchain_core")
    from langchain_core.document_loaders import BaseLoader

    class FolderReader(BaseLoader):
        def load(self, path: str) -> list[dict[str, Any]]:  # type: ignore[override]
            return [{"page_content": text, "metadata": {}} for text in PAGES]

    with cd.observe("folder", out=None) as observation:
        FolderReader().load("contracts/")
    (load,) = observation.report.trace.stages
    assert load.documents_out == 2 and load.sources == []


def test_a_query_embedded_to_search_with_is_no_step(monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("haystack")
    pytest.importorskip("langchain_core")
    from haystack import Pipeline, component
    from langchain_core.embeddings import Embeddings

    class SentenceTransformer:
        def encode(self, inputs: Any) -> _Array:
            return _Array(0 if isinstance(inputs, str) else len(inputs), 384)

    _module(monkeypatch, "sentence_transformers", SentenceTransformer=SentenceTransformer)
    model = SentenceTransformer()

    @component
    class LocalTextEmbedder:
        def __init__(self) -> None:
            component.set_input_type(self, "text", str)

        @component.output_types(embedding=list[float])
        def run(self, **inputs: Any) -> dict[str, list[float]]:
            model.encode(inputs["text"])
            return {"embedding": [0.0] * 384}

    class LocalEmbeddings(Embeddings):
        def embed_documents(self, texts: list[str]) -> list[list[float]]:
            model.encode(texts)
            return [[0.0] * 384 for _ in texts]

        def embed_query(self, text: str) -> list[float]:
            return self.embed_documents([text])[0]

    pipeline = Pipeline()
    pipeline.add_component("embed", LocalTextEmbedder())
    with cd.observe("search", out=None) as observation:
        pipeline.run({"embed": {"text": PAGES[0]}})
        LocalTextEmbedder().run(text=PAGES[0])
        LocalEmbeddings().embed_query(PAGES[0])
        LocalEmbeddings().embed_documents(PAGES)
    # Only the documents embedded for the index are a step.
    (step,) = [s for s in observation.report.trace.stages if s.parent is None]
    assert (step.kind, step.component, step.documents_in) == ("embed", "LocalEmbeddings", 2)


def test_only_a_batch_of_documents_is_flattened() -> None:
    from complydoc.observe import adapters

    first, second = ({"page_content": text, "metadata": {}} for text in PAGES)
    assert adapters.listed([[first], [second]]) == [first, second]
    # A text with nothing in it, a scan's, is chunked into nothing.
    assert adapters.listed([[first], []]) == [first]
    # A search's `(document, score)` pairs, or a row of values, are items as they are.
    assert adapters.listed([(first, 0.9)]) == [(first, 0.9)]
    assert adapters.listed([[first, 0.9]]) == [[first, 0.9]]
