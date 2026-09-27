"""Observing an ingestion pipeline with `cd.observe`."""

from __future__ import annotations

import asyncio
import socket
from pathlib import Path

import pytest
from langchain_core.document_loaders import BaseLoader
from langchain_core.documents import Document
from langchain_core.embeddings import DeterministicFakeEmbedding
from langchain_text_splitters import RecursiveCharacterTextSplitter

import complydoc as cd
from complydoc import offline

IBAN = "GB29 NWBK 6016 1331 9268 19"


class _Loader(BaseLoader):
    """Two pages of one file, one holding an account number."""

    def __init__(self, path: str, mode: str = "page") -> None:
        self.file_path = path
        self.mode = mode
        self.api_key = "sk-not-a-setting"

    def lazy_load(self):  # type: ignore[no-untyped-def]
        yield Document(
            page_content=f"Payments go to account {IBAN} every month. " * 5,
            metadata={"source": self.file_path, "page": 0},
        )
        yield Document(
            page_content="Termination needs thirty days notice in writing. " * 5,
            metadata={"source": self.file_path, "page": 1},
        )


class _Embeddings(DeterministicFakeEmbedding):
    """Embeds locally, after looking up a host as a hosted model would."""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        socket.getaddrinfo("localhost", 80)
        return super().embed_documents(texts)


@pytest.fixture
def pipeline(tmp_path: Path):  # type: ignore[no-untyped-def]
    def run(**options):  # type: ignore[no-untyped-def]
        splitter = RecursiveCharacterTextSplitter(chunk_size=120, chunk_overlap=0)
        embeddings = _Embeddings(size=8)
        with cd.observe("contracts", out=tmp_path, **options) as observation:
            documents = _Loader(str(tmp_path / "contract.pdf")).load()
            chunks = splitter.split_documents(documents)
            embeddings.embed_documents([chunk.page_content for chunk in chunks])
        return observation

    return run


def test_each_library_call_is_a_stage_with_its_settings(pipeline) -> None:  # type: ignore[no-untyped-def]
    observation = pipeline()
    assert observation.error is None
    trace = observation.report.trace
    assert [s.kind for s in trace.stages] == ["load", "split", "embed"]
    load, split, embed = trace.stages
    # `load` calls `lazy_load`, and `split_documents` calls `create_documents`: one stage each.
    assert (load.method, split.method) == ("load", "split_documents")
    assert load.documents_out == 2
    assert load.parameters == {"file_path": "contract.pdf", "mode": "page"}
    assert split.parameters["chunk_size"] == 120
    assert split.documents_in == 2 and split.chunks == 0
    assert split.documents_out == len(observation.report.chunks[0].chunks)
    assert embed.documents_in == split.documents_out
    assert embed.vectors == split.documents_out and embed.dimensions == 8


def test_an_identifier_is_followed_to_the_host_it_was_sent_to(pipeline) -> None:  # type: ignore[no-untyped-def]
    observation = pipeline()
    load, split, embed = observation.report.trace.stages
    ibans = [
        {i.fingerprint for i in stage.identifiers if i.label == "IBAN"}
        for stage in (load, split, embed)
    ]
    assert ibans[0] and ibans[0] == ibans[1] == ibans[2]
    assert embed.hosts == ["localhost"]
    assert observation.report.run.content_sent_to == ["localhost"]
    statement = observation.report.limitations[0].statement
    assert "sent" in statement and "localhost" in statement and "identifier" in statement
    assert IBAN not in observation.path.read_text()


def test_the_report_is_written_and_reads_back(pipeline, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    first, second = pipeline(), pipeline()
    assert first.path != second.path
    assert first.path.parent == tmp_path and first.path.name.startswith("contracts-")
    report = cd.load_report(second.path)
    assert report.trace is not None and len(report.trace.stages) == 3
    assert report.documents[0].relative_path == "contract.pdf"
    assert report.chunks and all(c.start is not None for c in report.chunks[0].chunks)
    splitter = "RecursiveCharacterTextSplitter chunk_size=120 chunk_overlap=0"
    assert report.chunks[0].chunker == splitter


def test_scan_off_records_the_shape_only(pipeline) -> None:  # type: ignore[no-untyped-def]
    trace = pipeline(scan="off").report.trace
    assert all(stage.scanned == "off" and not stage.identifiers for stage in trace.stages)
    assert trace.stages[2].hosts == ["localhost"]


def test_nothing_is_touched_outside_the_block() -> None:
    before = RecursiveCharacterTextSplitter.split_documents
    with cd.observe(out=None):
        assert RecursiveCharacterTextSplitter.split_documents is not before
    assert RecursiveCharacterTextSplitter.split_documents is before
    assert not offline.is_armed()


def test_what_the_pipeline_raises_is_raised_and_recorded(tmp_path: Path) -> None:
    class Broken(_Loader):
        def lazy_load(self):  # type: ignore[no-untyped-def]
            raise ValueError("no such page")
            yield

    with pytest.raises(ValueError), cd.observe(out=tmp_path) as observation:
        Broken("x.pdf").load()
    trace = observation.report.trace
    assert trace.error == "ValueError: no such page"
    assert trace.stages[0].error == "ValueError: no such page"


def test_a_lazy_stage_not_read_to_the_end_says_so(tmp_path: Path) -> None:
    with cd.observe(out=None) as observation:
        next(iter(_Loader(str(tmp_path / "a.pdf")).lazy_load()))
    stage = observation.report.trace.stages[0]
    assert not stage.finished and stage.documents_out == 1


def test_async_loading_and_embedding_are_stages(tmp_path: Path) -> None:
    async def run() -> None:
        documents = [d async for d in _Loader(str(tmp_path / "a.pdf")).alazy_load()]
        await _Embeddings(size=4).aembed_documents([d.page_content for d in documents])

    with cd.observe(out=None) as observation:
        asyncio.run(run())
    assert [s.kind for s in observation.report.trace.stages] == ["load", "embed"]


def test_a_function_of_your_own_is_a_stage(tmp_path: Path) -> None:
    @cd.stage("dedupe")
    def dedupe(documents: list[Document]) -> list[Document]:
        splitter = RecursiveCharacterTextSplitter(chunk_size=50, chunk_overlap=0)
        splitter.split_documents(documents)  # inside the stage: not a stage of its own
        return documents[:1]

    assert dedupe([Document(page_content="x")]) == [Document(page_content="x")]
    with cd.observe(out=None) as observation:
        dedupe(_Loader(str(tmp_path / "a.pdf")).load())
    stages = observation.report.trace.stages
    assert [(s.kind, s.component) for s in stages] == [("load", "_Loader"), ("custom", "dedupe")]
    assert stages[1].documents_in == 2 and stages[1].documents_out == 1


def test_blocks_do_not_nest() -> None:
    with cd.observe(out=None), pytest.raises(RuntimeError, match="do not nest"):
        cd.observe(out=None).__enter__()


def test_the_guard_inside_record_mode_keeps_recording() -> None:
    with offline.permitted() as made:
        with offline.guarded():
            pass
        socket.getaddrinfo("localhost", 80)
    assert made == ["DNS lookup of 'localhost'"]
