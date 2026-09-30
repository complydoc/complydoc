"""Real ingestion pipelines, observed from end to end.

Each is a pipeline as a team would write it: real loaders, splitters, embedding models and
vector stores, run on the sample documents bundled with complydoc, one of which is a scan
with no text layer. The embedding models are FastEmbed's, run on this machine, and the
stores are in memory, so nothing is sent anywhere; the one test that calls OpenAI runs
only where OPENAI_API_KEY is set.

    uv sync --group dev --group integrations --group pipelines
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

pytest.importorskip("chromadb")
pytest.importorskip("fastembed")
pytest.importorskip("llama_index.vector_stores.chroma")

import chromadb
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

import complydoc as cd
from complydoc.report.models import Trace, TraceStage

SAMPLE = Path(cd.__file__).parent / "sample"
SCAN = "invoice-scan.pdf"
MODEL = "BAAI/bge-small-en-v1.5"
CACHE = os.path.expanduser(os.environ.get("FASTEMBED_CACHE_PATH", "~/.cache/fastembed"))


@pytest.fixture(scope="module")
def embeddings() -> FastEmbedEmbeddings:
    # Made before any block opens: the model is downloaded once, not by the pipeline.
    return FastEmbedEmbeddings(model_name=MODEL, cache_dir=CACHE)


@pytest.fixture(scope="module")
def chroma() -> chromadb.ClientAPI:
    return chromadb.EphemeralClient(settings=chromadb.Settings(anonymized_telemetry=False))


def langchain_chunks() -> list:  # type: ignore[type-arg]
    documents = DirectoryLoader(str(SAMPLE), glob="*.pdf", loader_cls=PyPDFLoader).load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=80)
    return splitter.split_documents(documents)


def one(trace: Trace, kind: str) -> TraceStage:
    """The outermost stage of `kind`."""
    return next(s for s in trace.stages if s.kind == kind and s.parent is None)


def inside(trace: Trace, stage: TraceStage) -> list[TraceStage]:
    return [s for s in trace.stages if s.parent == stage.index]


def loaded_with_text(trace: Trace) -> set[str]:
    """The documents a loader read text from, by the innermost loader that read each."""
    loads = [s for s in trace.stages if s.kind == "load"]
    return {d.source for s in loads for d in s.documents if d.characters > 0}


def test_langchain_into_chroma(embeddings, chroma, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    from langchain_chroma import Chroma

    store = Chroma(client=chroma, collection_name="contracts", embedding_function=embeddings)
    with cd.observe("langchain-chroma", out=tmp_path) as run:
        store.add_documents(langchain_chunks())
    assert run.error is None and run.path is not None
    trace = run.report.trace

    assert [s.kind for s in trace.stages if s.parent is None] == ["load", "split", "store"]
    stored = one(trace, "store")
    assert (stored.component, stored.method) == ("Chroma", "add_documents")
    assert [s.kind for s in inside(trace, stored)] == ["embed"]

    # The scan loaded no text, and is said so; every other document reaches the store.
    warned = [w for s in trace.stages for w in s.warnings if w.code == "empty_document"]
    assert [w.sources for w in warned] == [[SCAN]]
    assert {d.source for d in stored.documents} == loaded_with_text(trace)
    assert stored.identifiers and "source" in stored.metadata_keys

    # Nothing left the machine, and the report reads back as written.
    assert not any(s.hosts for s in trace.stages) and run.report.run.content_sent_to == []
    again = cd.load_report(run.path)
    assert again.trace is not None and len(again.trace.stages) == len(trace.stages)


def test_langchain_faiss_from_documents(embeddings) -> None:  # type: ignore[no-untyped-def]
    from langchain_community.vectorstores import FAISS

    with cd.observe("langchain-faiss", out=None) as run:
        FAISS.from_documents(langchain_chunks(), embeddings)
    trace = run.report.trace

    # A store built by a class method is a step, though FAISS never calls `add_texts`.
    stored = one(trace, "store")
    assert (stored.component, stored.method) == ("FAISS", "from_documents")
    assert stored.parameters == {}
    assert [s.kind for s in inside(trace, stored)] == ["embed"]
    assert {d.source for d in stored.documents} == loaded_with_text(trace)


def test_llamaindex_ingestion_pipeline_into_chroma(chroma) -> None:  # type: ignore[no-untyped-def]
    from llama_index.core import SimpleDirectoryReader
    from llama_index.core.ingestion import IngestionPipeline
    from llama_index.core.node_parser import SentenceSplitter
    from llama_index.embeddings.fastembed import FastEmbedEmbedding
    from llama_index.vector_stores.chroma import ChromaVectorStore

    embed = FastEmbedEmbedding(model_name=MODEL, cache_dir=CACHE)
    store = ChromaVectorStore(chroma_collection=chroma.get_or_create_collection("llama"))
    pipeline = IngestionPipeline(
        transformations=[SentenceSplitter(chunk_size=512), embed], vector_store=store
    )
    with cd.observe("llamaindex-chroma", out=None) as run:
        documents = SimpleDirectoryReader(str(SAMPLE), required_exts=[".pdf"]).load_data()
        pipeline.run(documents=documents)
    trace = run.report.trace

    assert [s.kind for s in trace.stages if s.parent is None] == ["load", "split", "embed", "store"]
    # LlamaIndex keeps the scan's empty text through to the store, and says so there.
    stored = one(trace, "store")
    assert any(w.code == "empty_texts" and w.sources == [SCAN] for w in stored.warnings)
    # The texts embedded carry each node's metadata before its text, and are still known
    # by the documents they came from; the scan's node, with no text, is its metadata alone.
    split, embedded = one(trace, "split"), one(trace, "embed")
    with_text = {d.source for d in split.documents if d.characters > 0}
    assert {d.source for d in embedded.documents} == with_text


@pytest.mark.skipif(not os.environ.get("OPENAI_API_KEY"), reason="calls OpenAI: set OPENAI_API_KEY")
def test_langchain_with_openai_embeddings() -> None:
    from langchain_core.vectorstores import InMemoryVectorStore
    from langchain_openai import OpenAIEmbeddings

    chunks = langchain_chunks()[:5]
    with cd.observe("langchain-openai", out=None) as run:
        InMemoryVectorStore(OpenAIEmbeddings(model="text-embedding-3-small")).add_documents(chunks)
    trace = run.report.trace

    embedded = one(trace, "store")
    (call,) = inside(trace, embedded)
    assert "api.openai.com" in call.hosts
    assert call.usd_basis == "estimated" and (call.usd or 0) > 0
    assert "api.openai.com" in run.report.run.content_sent_to
