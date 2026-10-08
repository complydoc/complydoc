"""Observing an ingestion pipeline with `cd.observe`."""

from __future__ import annotations

import asyncio
import socket
from pathlib import Path
from typing import Any

import pytest

# The base test jobs install no framework; cd.observe needs one to observe.
pytest.importorskip("langchain_text_splitters")

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


def test_a_trace_fits_the_published_schema(pipeline, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    """A pipeline's trace is a report like any other: every key it writes is described."""
    import json

    import jsonschema

    from complydoc.report.schema import report_json_schema

    from .test_report_schema import undescribed

    pipeline()
    schema = report_json_schema()
    written = sorted(tmp_path.rglob("*.json"))
    reports = [path for path in written if "run" in json.loads(path.read_text())]
    assert reports, "the pipeline wrote no report"
    for report in reports:
        data = json.loads(report.read_text())
        errors = list(jsonschema.Draft202012Validator(schema).iter_errors(data))
        assert not errors, [f"{list(e.absolute_path)}: {e.message[:120]}" for e in errors[:5]]
        assert not undescribed(data, schema, schema["$defs"])


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
    # Where it was raised, without the account's folders.
    traceback = trace.stages[0].traceback
    assert "Traceback" in traceback and "lazy_load" in traceback
    assert str(Path.home()) not in traceback


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
        splitter.split_documents(documents)  # inside the stage: recorded as its child
        return documents[:1]

    assert dedupe([Document(page_content="x")]) == [Document(page_content="x")]
    with cd.observe(out=None) as observation:
        dedupe(_Loader(str(tmp_path / "a.pdf")).load())
    stages = observation.report.trace.stages
    assert [(s.kind, s.component, s.parent) for s in stages] == [
        ("load", "_Loader", None),
        ("custom", "dedupe", None),
        ("split", "RecursiveCharacterTextSplitter", 1),
    ]
    assert stages[1].documents_in == 2 and stages[1].documents_out == 1
    # The split inside the step makes no chunks of the run's own: only outermost splits do.
    assert observation.report.chunks is not None


def test_blocks_do_not_nest() -> None:
    with cd.observe(out=None), pytest.raises(RuntimeError, match="do not nest"):
        cd.observe(out=None).__enter__()


def test_the_guard_inside_record_mode_keeps_recording() -> None:
    with offline.permitted() as made:
        with offline.guarded():
            pass
        socket.getaddrinfo("localhost", 80)
    assert made == ["DNS lookup of 'localhost'"]


def test_a_llamaindex_ingestion_pipeline_is_observed(tmp_path: Path) -> None:
    pytest.importorskip("llama_index.core")
    from llama_index.core import Document as LlamaDocument
    from llama_index.core.embeddings import MockEmbedding
    from llama_index.core.ingestion import IngestionPipeline
    from llama_index.core.node_parser import SentenceSplitter
    from llama_index.core.readers.base import BaseReader

    class Reader(BaseReader):
        def load_data(self):  # type: ignore[no-untyped-def]
            text = f"Payments go to account {IBAN} every month. " * 20
            path = str(tmp_path / "contract.pdf")
            return [LlamaDocument(text=text, metadata={"file_path": path})]

    splitter = SentenceSplitter(chunk_size=128, chunk_overlap=0)
    pipeline = IngestionPipeline(transformations=[splitter, MockEmbedding(embed_dim=8)])
    with cd.observe(out=None) as observation:
        pipeline.run(documents=Reader().load_data())
    stages = observation.report.trace.stages
    assert [(s.kind, s.component) for s in stages] == [
        ("load", "Reader"),
        ("split", "SentenceSplitter"),
        ("embed", "MockEmbedding"),
    ]
    split, embed = stages[1], stages[2]
    assert split.parameters["chunk_size"] == 128
    assert embed.documents_in == split.documents_out and embed.dimensions == 8
    # What the embedding model was sent holds the account number, found by its fingerprint.
    assert {i.label for i in embed.identifiers} >= {"IBAN"}
    assert observation.libraries.get("llama-index-core")


def test_a_policy_holds_a_pipeline_to_what_it_may_send(pipeline, tmp_path: Path) -> None:
    from complydoc.report.policy import check_policy, read_policy

    report = pipeline().report
    with pytest.raises(cd.ExpectationError, match="IBAN"):
        cd.expect(report).no_identifiers_sent(severity="high")
    cd.expect(report).only_hosts(["localhost"])

    policy = tmp_path / "policy.yaml"
    policy.write_text(
        "rules:\n  no_identifiers_sent: true\n  only_hosts:\n    hosts: [api.example.com]\n"
    )
    result = check_policy(report, read_policy(policy))
    assert [rule.rule for rule in result.failed] == ["no_identifiers_sent", "only_hosts"]


def test_a_pipeline_rule_cannot_pass_a_report_without_a_pipeline(tmp_path: Path) -> None:
    report = cd.inspect_documents([{"page_content": "no pipeline here"}])
    with pytest.raises(ValueError, match="no pipeline"):
        cd.expect(report).no_identifiers_sent()


def test_each_stage_says_when_it_started_what_it_weighed_and_cost(pipeline) -> None:  # type: ignore[no-untyped-def]
    load, split, embed = pipeline().report.trace.stages
    assert 0 <= load.started <= split.started <= embed.started
    assert split.tokens_in and split.tokens_out and embed.tokens_in == split.tokens_out
    # The fake model names no priced model, so what it sent is left unpriced, not guessed.
    assert (embed.usd, embed.usd_basis) == (None, "unpriced")
    assert load.usd is None


def test_an_embedding_model_the_price_table_lists_is_priced(tmp_path: Path) -> None:
    class Priced(_Embeddings):
        model: str = "text-embedding-3-small"

    with cd.observe(out=None) as observation:
        Priced(size=4).embed_documents(["one two three"] * 1000)
    (embed,) = observation.report.trace.stages
    assert embed.usd_basis == "estimated"
    assert embed.usd == pytest.approx(embed.tokens_in * 0.02 / 1_000_000)


def test_what_a_stage_passed_on_is_previewed_masked(pipeline) -> None:  # type: ignore[no-untyped-def]
    load, split, embed = pipeline().report.trace.stages
    assert load.previews and load.previews[0].page == 1
    assert load.previews[0].source == "contract.pdf"
    assert IBAN not in load.previews[0].text and "Payments go to account" in load.previews[0].text
    assert len(split.previews) <= 20 and embed.previews
    # The metadata's absolute path is marked as one, without the folders it names.
    assert load.previews[0].metadata["source"] == "/…/contract.pdf"
    assert not pipeline(previews=0).report.trace.stages[0].previews


def test_a_directory_loader_holds_the_loader_it_runs_for_each_file(tmp_path: Path) -> None:
    class Directory(BaseLoader):
        def lazy_load(self):  # type: ignore[no-untyped-def]
            for name in ("a.pdf", "b.pdf"):
                yield from _Loader(str(tmp_path / name)).load()

    with cd.observe(out=None) as observation:
        Directory().load()
    stages = observation.report.trace.stages
    assert [(s.component, s.parent) for s in stages] == [
        ("Directory", None),
        ("_Loader", 0),
        ("_Loader", 0),
    ]
    # The files' pages are the directory loader's, and are audited once.
    assert len(observation.report.documents) == 2
    assert sum(d.page_count for d in observation.report.documents) == 4


def test_an_audit_says_when_each_document_began_so_its_run_can_be_traced() -> None:
    report = cd.full_audit("src/complydoc/sample", jobs=1)
    starts = [d.timing.started_at for d in report.documents if d.timing is not None]
    assert len(starts) == len(report.documents) and all(isinstance(s, float) for s in starts)
    # The trace itself is made by the viewer from these timings, not written again.
    assert report.trace is None


def test_each_document_is_followed_from_its_loader_to_what_was_sent(pipeline) -> None:  # type: ignore[no-untyped-def]
    load, split, embed = pipeline().report.trace.stages
    iban = next(i.fingerprint for i in load.identifiers if i.label == "IBAN")
    for stage in (load, split, embed):
        (document,) = stage.documents
        assert document.source == "contract.pdf"
        assert iban in document.identifiers
    assert load.documents[0].items == 2
    # The embedding model is given bare texts, known by the chunks they were.
    assert embed.documents[0].items == split.documents[0].items == split.documents_out


def test_quiet_failures_are_warned_about(tmp_path: Path) -> None:
    class Scanned(BaseLoader):
        """A scan with no text layer, and a file with one blank page."""

        def lazy_load(self):  # type: ignore[no-untyped-def]
            yield Document(page_content="", metadata={"source": "scan.pdf", "page": 0})
            yield Document(page_content="Terms apply. " * 10, metadata={"source": "a.pdf"})
            yield Document(page_content="  ", metadata={"source": "a.pdf", "page": 1})

    splitter = RecursiveCharacterTextSplitter(chunk_size=40, chunk_overlap=0)
    with cd.observe("scans", out=None) as observation:
        documents = Scanned().load()
        chunks = splitter.split_documents(documents)
        _Embeddings(size=8).embed_documents([c.page_content for c in chunks] + [""])
    load, split, embed = observation.report.trace.stages
    codes = {w.code: w for w in load.warnings}
    assert codes["empty_document"].sources == ["scan.pdf"]
    assert codes["empty_pages"].sources == ["a.pdf"]
    assert codes["empty_pages"].message == "1 page with no text, in 1 document"
    assert "tiny_chunks" in {w.code for w in split.warnings}
    assert [w.code for w in embed.warnings] == ["empty_texts"]
    assert "1 document loaded no text" in observation.summary()


def test_a_vector_store_is_a_stage_holding_its_embedding_call(tmp_path: Path) -> None:
    from langchain_core.vectorstores import InMemoryVectorStore

    splitter = RecursiveCharacterTextSplitter(chunk_size=120, chunk_overlap=0)
    with cd.observe("indexed", out=tmp_path) as observation:
        chunks = splitter.split_documents(_Loader(str(tmp_path / "contract.pdf")).load())
        InMemoryVectorStore(_Embeddings(size=8)).add_documents(chunks)
    _load, _split, store, embed = observation.report.trace.stages
    assert (store.kind, embed.kind, embed.parent) == ("store", "embed", store.index)
    assert store.documents_in == store.vectors == len(chunks)
    assert store.documents_out is None and "source" in store.metadata_keys
    assert {i.label for i in store.identifiers} >= {"IBAN"}
    assert store.documents[0].source == "contract.pdf"
    assert "stored" in observation.summary()


def test_names_a_run_could_not_look_for_are_said_not_masked(tmp_path: Path) -> None:
    from complydoc.config.loader import load_config

    settings = load_config()
    # A name model that is not there, and no fallback: names cannot be looked for.
    missing = {
        key: category.model_copy(
            update={
                "model": category.model.model_copy(update={"name": "no-such/model"}),
                "fallback": [],
            }
        )
        for key, category in settings.sensitive.categories.items()
        if category.model_backed and category.model is not None
    }
    sensitive = settings.sensitive.model_copy(
        update={"categories": {**settings.sensitive.categories, **missing}}
    )
    config = settings.model_copy(update={"sensitive": sensitive})
    with cd.observe("contracts", out=None, config=config) as observation:
        _Loader(str(tmp_path / "contract.pdf")).load()
    trace = observation.report.trace
    assert "Person name" in trace.unscanned
    # The stage says it was read by patterns alone, not that names were looked for.
    assert trace.stages[0].scanned == "patterns"
    statement = observation.report.limitations[0].statement
    assert "neither counted nor masked" in statement
    assert "Not looked for" in observation.summary()


def test_a_store_built_by_a_class_method_is_a_stage(tmp_path: Path) -> None:
    from langchain_core.vectorstores import InMemoryVectorStore

    splitter = RecursiveCharacterTextSplitter(chunk_size=120, chunk_overlap=0)
    with cd.observe("built", out=None) as observation:
        chunks = splitter.split_documents(_Loader(str(tmp_path / "contract.pdf")).load())
        InMemoryVectorStore.from_documents(chunks, _Embeddings(size=8))
    stages = observation.report.trace.stages
    store = next(s for s in stages if s.kind == "store" and s.parent is None)
    assert (store.component, store.method) == ("InMemoryVectorStore", "from_documents")
    assert store.documents_in == len(chunks) and store.parameters == {}
    # What it ran inside, down to the embedding call, is part of it.
    below = {store.index}
    for stage in stages:
        if stage.parent in below:
            below.add(stage.index)
    assert any(s.kind == "embed" and s.index in below for s in stages)


def test_documents_read_by_your_own_code_are_checked_where_they_enter() -> None:
    documents = [
        Document(page_content="", metadata={"source": "scan.pdf", "page": 0}),
        Document(page_content="Terms apply. " * 10, metadata={"source": "a.pdf", "page": 0}),
    ]
    splitter = RecursiveCharacterTextSplitter(chunk_size=120, chunk_overlap=0)
    with cd.observe("own-loader", out=None) as observation:
        splitter.split_documents(documents)
    (split,) = observation.report.trace.stages
    empty = next(w for w in split.warnings if w.code == "empty_document")
    assert empty.sources == ["scan.pdf"]


SAMPLE_PDFS = sorted((Path(cd.__file__).parent / "sample").glob("*.pdf"))


def test_a_file_read_with_pypdf_is_a_load_step() -> None:
    import pypdf

    path = str(SAMPLE_PDFS[0])
    with cd.observe("plain", out=None) as observation:
        reader = pypdf.PdfReader(path)
        pages = [page.extract_text() for page in reader.pages]
        # Opened and never read: no step.
        pypdf.PdfReader(str(SAMPLE_PDFS[1]))
    (read,) = observation.report.trace.stages
    assert (read.kind, read.component, read.method) == ("load", "PdfReader", "read")
    assert read.parameters == {"file_path": path}
    assert read.documents_out == len(pages)
    assert read.documents[0].source.endswith(SAMPLE_PDFS[0].name)


def test_a_file_read_with_pymupdf_is_a_load_step() -> None:
    pymupdf = pytest.importorskip("pymupdf")

    with cd.observe("plain", out=None) as observation:
        document = pymupdf.open(str(SAMPLE_PDFS[0]))
        texts = [page.get_text() for page in document]
    (read,) = observation.report.trace.stages
    assert (read.kind, read.component) == ("load", "Document")
    assert read.documents_out == len(texts)


def test_a_loader_reading_with_pypdf_is_one_step() -> None:
    loaders = pytest.importorskip("langchain_community.document_loaders")

    with cd.observe("loader", out=None) as observation:
        loaders.PyPDFLoader(str(SAMPLE_PDFS[0])).load()
    assert [s.component for s in observation.report.trace.stages] == ["PyPDFLoader"]


def test_a_text_previewed_by_every_step_is_masked_once(monkeypatch: pytest.MonkeyPatch) -> None:
    from complydoc.config.loader import load_config
    from complydoc.extraction.strings import mask_text
    from complydoc.observe import measure

    asked: list[str] = []

    def counting(text: str, **kwargs: Any) -> Any:
        asked.append(text)
        return mask_text(text, **kwargs)

    monkeypatch.setattr(measure, "mask_text", counting)
    measurer = measure.Measurer(load_config(), reveal=False, previews=5, root=None)
    items = [("Write to ana@example.com", {"page": 1})]
    first = measurer.preview(items)
    again = measurer.preview(items)

    assert "ana@example.com" not in first[0].text
    assert again[0].text == first[0].text
    assert asked.count("Write to ana@example.com") == 1


def _warm_module():  # type: ignore[no-untyped-def]
    # `complydoc.observe` is the function as well as the package, so it is fetched by name.
    import importlib

    return importlib.import_module("complydoc.observe.warm")


def test_what_reading_the_output_needs_is_loaded_while_the_pipeline_runs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import threading

    warm = _warm_module()
    asked: list[tuple[str, str]] = []
    finished = threading.Event()

    def recorded(settings: Any, scan: str) -> None:
        asked.append((type(settings).__name__, scan))
        finished.set()

    monkeypatch.setattr(warm, "_warm", recorded)
    with cd.observe("p", out=None, scan="patterns") as run:
        _Loader(str(tmp_path / "a.pdf")).load()
        # Begun at the block's start, on a thread of its own, not at its end.
        assert finished.wait(timeout=5)
    assert asked == [("Config", "patterns")]
    assert run.report is not None and run.error is None


def test_a_warm_up_that_fails_does_not_fail_the_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    warm = _warm_module()

    def broken(settings: Any, scan: str) -> Any:
        raise RuntimeError("no thread for you")

    monkeypatch.setattr(warm, "start", broken)
    with cd.observe("p", out=None) as run:
        _Loader(str(tmp_path / "a.pdf")).load()
    assert run.error is None
    assert run.report is not None and run.report.trace is not None


def test_a_warm_up_fetches_nothing_and_skips_what_scan_off_does_not_use(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from complydoc.config.loader import load_config
    from complydoc.cost import tokenizer

    warm = _warm_module()
    loaded: list[str] = []
    monkeypatch.setattr(tokenizer, "_encoder", lambda name: loaded.append(name))
    # A vocabulary that is not in the cache would be fetched, inside a block that
    # records every connection as the pipeline's own: it is left for where it is used.
    monkeypatch.setattr(tokenizer, "available_encodings", lambda: [])
    with offline.guarded():
        warm._warm(load_config(), "off")
    assert loaded == []
