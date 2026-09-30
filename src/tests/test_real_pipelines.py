"""The frameworks' own tutorials, run under `cd.observe` from end to end.

Each test is an official tutorial's indexing code as it is published, run on the sample
documents bundled with complydoc, one of which is a scan with no text layer:

- LangChain, "Build a semantic search engine": PDF pages read with the tutorial's own
  pypdf helper, each file read a load step, `RecursiveCharacterTextSplitter`, and
  `add_documents` into the `InMemoryVectorStore` or `Chroma` it offers.
  https://docs.langchain.com/oss/python/langchain/knowledge-base
- LlamaIndex, "Starter Tutorial (Using Local LLMs)": `SimpleDirectoryReader` and
  `VectorStoreIndex.from_documents`.
  https://developers.llamaindex.ai/python/framework/getting_started/starter_example_local/
- LlamaIndex, "Ingestion Pipeline": `SentenceSplitter`, `TitleExtractor` and an embedding
  model into an in-memory Qdrant store.
  https://developers.llamaindex.ai/python/framework/module_guides/loading/ingestion_pipeline/

- create-llama (MIT), the `generate.py` its projects ship: `SimpleDirectoryReader` with
  `filename_as_id`, metadata set on each document, `VectorStoreIndex.from_documents` and
  `persist`. Its FastAPI template imports LlamaIndex inside the function, so that case runs
  in a fresh interpreter, where the import first happens inside the block.
  https://github.com/run-llama/create-llama

Only what cannot run offline is swapped: the embedding models are FastEmbed's, run on this
machine, and `TitleExtractor` asks LlamaIndex's `MockLLM`. The one test that calls OpenAI,
as the LangChain tutorial does by default, runs only where OPENAI_API_KEY is set.

    make test-pipelines
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("fastembed")
pytest.importorskip("langchain_chroma")
pytest.importorskip("llama_index.vector_stores.qdrant")

import pypdf
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

import complydoc as cd
from complydoc.report.models import Trace, TraceStage

SAMPLE = Path(cd.__file__).parent / "sample"
SCAN = "invoice-scan.pdf"
MODEL = "BAAI/bge-small-en-v1.5"
CACHE = os.path.expanduser(os.environ.get("FASTEMBED_CACHE_PATH", "~/.cache/fastembed"))


def load_pdf_pages(file_path: str) -> list[Document]:
    """The LangChain tutorial's helper, as published."""
    reader = pypdf.PdfReader(file_path)
    return [
        Document(
            page_content=page.extract_text() or "",
            metadata={"source": file_path, "page": i},
        )
        for i, page in enumerate(reader.pages)
    ]


def semantic_search_indexing(vector_store) -> None:  # type: ignore[no-untyped-def]
    """The LangChain tutorial's indexing, over every sample PDF rather than one 10-K."""
    docs = [page for path in sorted(SAMPLE.glob("*.pdf")) for page in load_pdf_pages(str(path))]
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000, chunk_overlap=200, add_start_index=True
    )
    all_splits = text_splitter.split_documents(docs)
    vector_store.add_documents(documents=all_splits)


@pytest.fixture(scope="module")
def embeddings() -> FastEmbedEmbeddings:
    # Made before any block opens: the model is downloaded once, not by the pipeline.
    return FastEmbedEmbeddings(model_name=MODEL, cache_dir=CACHE)


@pytest.fixture
def llama_settings():  # type: ignore[no-untyped-def]
    """LlamaIndex's global Settings, set as the tutorials set them and put back after."""
    from llama_index.core import Settings
    from llama_index.core.llms import MockLLM
    from llama_index.embeddings.fastembed import FastEmbedEmbedding

    before = (Settings._embed_model, Settings._llm)
    Settings.embed_model = FastEmbedEmbedding(model_name=MODEL, cache_dir=CACHE)
    Settings.llm = MockLLM(max_tokens=8)
    yield Settings
    Settings._embed_model, Settings._llm = before


def top(trace: Trace) -> list[str]:
    return [s.kind for s in trace.stages if s.parent is None]


def one(trace: Trace, kind: str) -> TraceStage:
    """The outermost stage of `kind`."""
    return next(s for s in trace.stages if s.kind == kind and s.parent is None)


def inside(trace: Trace, stage: TraceStage) -> list[TraceStage]:
    return [s for s in trace.stages if s.parent == stage.index]


def warned(trace: Trace, code: str) -> list[list[str]]:
    return [w.sources for s in trace.stages for w in s.warnings if w.code == code]


def named(sources: list[str]) -> list[str]:
    return [Path(source).name for source in sources]


@pytest.mark.parametrize("store", ["InMemoryVectorStore", "Chroma"])
def test_langchain_semantic_search(embeddings, store: str, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    if store == "Chroma":
        from langchain_chroma import Chroma

        vector_store = Chroma(
            collection_name="example_collection",
            embedding_function=embeddings,
            persist_directory=str(tmp_path / "chroma_langchain_db"),
        )
    else:
        from langchain_core.vectorstores import InMemoryVectorStore

        vector_store = InMemoryVectorStore(embeddings)

    with cd.observe("semantic-search", out=tmp_path) as run:
        semantic_search_indexing(vector_store)
    assert run.error is None and run.path is not None
    trace = run.report.trace

    # The pages are read by the tutorial's own function, with pypdf: each file read is a
    # load step of its own, and the store holds the embedding call.
    files = sorted(SAMPLE.glob("*.pdf"))
    assert top(trace) == ["load"] * len(files) + ["split", "store"]
    reads = [s for s in trace.stages if s.kind == "load"]
    assert {s.component for s in reads} == {"PdfReader"}
    assert sorted(named([s.parameters["file_path"] for s in reads])) == [f.name for f in files]
    stored = one(trace, "store")
    assert (stored.component, stored.method) == (store, "add_documents")
    assert [s.kind for s in inside(trace, stored)] == ["embed"]

    # The scan's empty page is warned of on the read of that file, and goes no further.
    assert [named(sources) for sources in warned(trace, "empty_document")] == [[SCAN]]
    assert SCAN not in named([d.source for d in stored.documents])
    assert stored.identifiers and "start_index" in stored.metadata_keys

    # Nothing left the machine, and the report reads back as written.
    assert not any(s.hosts for s in trace.stages)
    again = cd.load_report(run.path)
    assert again.trace is not None and len(again.trace.stages) == len(trace.stages)


def test_llamaindex_starter(llama_settings) -> None:  # type: ignore[no-untyped-def]
    from llama_index.core import SimpleDirectoryReader, VectorStoreIndex

    with cd.observe("starter", out=None) as run:
        documents = SimpleDirectoryReader(str(SAMPLE), required_exts=[".pdf"]).load_data()
        VectorStoreIndex.from_documents(documents)
    trace = run.report.trace

    assert top(trace) == ["load", "split", "embed", "store"]
    assert one(trace, "store").component == "SimpleVectorStore"
    assert named(warned(trace, "empty_document")[0]) == [SCAN]
    # LlamaIndex keeps the scan's empty text all the way into the index.
    assert named(warned(trace, "empty_texts")[0]) == [SCAN]
    # The texts embedded carry each node's metadata before its text, and are still known
    # by the documents they came from; the scan's node, with no text, is its metadata alone.
    split, embedded = one(trace, "split"), one(trace, "embed")
    with_text = {d.source for d in split.documents if d.characters > 0}
    assert {d.source for d in embedded.documents} == with_text


def pipeline(chunk_size: int):  # type: ignore[no-untyped-def]
    """The ingestion guide's pipeline, into the in-memory Qdrant it connects."""
    import qdrant_client
    from llama_index.core import Settings
    from llama_index.core.extractors import TitleExtractor
    from llama_index.core.ingestion import IngestionPipeline
    from llama_index.core.node_parser import SentenceSplitter
    from llama_index.vector_stores.qdrant import QdrantVectorStore

    client = qdrant_client.QdrantClient(location=":memory:")
    vector_store = QdrantVectorStore(client=client, collection_name="test_store")
    return IngestionPipeline(
        transformations=[
            SentenceSplitter(chunk_size=chunk_size, chunk_overlap=0),
            TitleExtractor(),
            Settings.embed_model,
        ],
        vector_store=vector_store,
    )


def test_llamaindex_ingestion_pipeline(llama_settings) -> None:  # type: ignore[no-untyped-def]
    from llama_index.core import SimpleDirectoryReader

    # Built before the block, as the guide builds it before running it: classes imported
    # inside a block are not observed.
    ingestion = pipeline(chunk_size=512)
    with cd.observe("ingestion", out=None) as run:
        documents = SimpleDirectoryReader(str(SAMPLE), required_exts=[".pdf"]).load_data()
        ingestion.run(documents=documents)
    trace = run.report.trace

    assert top(trace) == ["load", "split", "transform", "embed", "store"]
    assert one(trace, "transform").component == "TitleExtractor"
    assert one(trace, "store").component == "QdrantVectorStore"
    assert not any(s.hosts for s in trace.stages)


def test_llamaindex_ingestion_pipeline_as_published_raises(llama_settings) -> None:  # type: ignore[no-untyped-def]
    """The guide's `chunk_size=25` is shorter than a real file's metadata: the splitter
    raises, and the trace keeps where."""
    from llama_index.core import SimpleDirectoryReader

    ingestion = pipeline(chunk_size=25)
    with (
        pytest.raises(ValueError, match="longer than chunk size"),
        cd.observe("ingestion", out=None) as run,
    ):
        documents = SimpleDirectoryReader(str(SAMPLE), required_exts=[".pdf"]).load_data()
        ingestion.run(documents=documents)
    trace = run.report.trace
    split = one(trace, "split")
    assert split.error is not None and "longer than chunk size" in split.error
    assert split.traceback is not None and "split_text_metadata_aware" in split.traceback
    assert trace.error is not None


@pytest.mark.skipif(not os.environ.get("OPENAI_API_KEY"), reason="calls OpenAI: set OPENAI_API_KEY")
def test_langchain_semantic_search_with_openai() -> None:
    from langchain_core.vectorstores import InMemoryVectorStore
    from langchain_openai import OpenAIEmbeddings

    embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
    with cd.observe("semantic-search", out=None) as run:
        semantic_search_indexing(InMemoryVectorStore(embeddings))
    trace = run.report.trace

    (call,) = inside(trace, one(trace, "store"))
    assert "api.openai.com" in call.hosts
    assert call.usd_basis == "estimated" and (call.usd or 0) > 0
    assert "api.openai.com" in run.report.run.content_sent_to


def test_create_llama_generate(llama_settings, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    """create-llama's `none` template: LlamaIndex imported at the top of the file."""
    from llama_index.core import SimpleDirectoryReader, VectorStoreIndex

    with cd.observe("generate", out=None) as run:
        documents = SimpleDirectoryReader(
            str(SAMPLE), recursive=True, filename_as_id=True, raise_on_error=True
        ).load_data()
        for doc in documents:
            doc.metadata["private"] = "false"
        index = VectorStoreIndex.from_documents(documents, show_progress=False)
        index.storage_context.persist(str(tmp_path / "storage"))
    trace = run.report.trace

    assert top(trace) == ["load", "split", "embed", "store"]
    # Documents keep their sources when their ids are the file names.
    assert named(warned(trace, "empty_document")[0]) == [SCAN]
    assert named(warned(trace, "empty_texts")[0]) == [SCAN]


LAZY_GENERATE = """
import json, os, sys
import complydoc as cd
from pathlib import Path

def generate_index():  # create-llama's FastAPI template imports inside the function
    from llama_index.core import Settings, VectorStoreIndex
    from llama_index.core.llms import MockLLM
    from llama_index.core.readers import SimpleDirectoryReader
    from llama_index.embeddings.fastembed import FastEmbedEmbedding

    Settings.embed_model = FastEmbedEmbedding(model_name=sys.argv[2], cache_dir=sys.argv[3])
    Settings.llm = MockLLM(max_tokens=8)
    documents = SimpleDirectoryReader(sys.argv[1], recursive=True).load_data()
    VectorStoreIndex.from_documents(documents)

assert "llama_index" not in sys.modules
with cd.observe("generate", out=None) as run:
    generate_index()
trace = run.report.trace
print(json.dumps({
    "top": [s.kind for s in trace.stages if s.parent is None],
    "libraries": sorted(run.libraries),
    "warnings": sorted({w.code for s in trace.stages for w in s.warnings}),
}))
"""


def test_create_llama_generate_importing_inside_the_function() -> None:
    """A library first imported inside the block is observed from that import on."""
    done = subprocess.run(
        [sys.executable, "-c", LAZY_GENERATE, str(SAMPLE), MODEL, CACHE],
        capture_output=True,
        text=True,
        check=True,
    )
    found = json.loads(done.stdout.strip().splitlines()[-1])

    assert found["top"] == ["load", "split", "embed", "store"]
    assert "llama-index-core" in found["libraries"]
    assert {"empty_document", "empty_texts"} <= set(found["warnings"])
