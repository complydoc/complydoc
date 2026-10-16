"""Erasure: the items a vector store keeps an identifier in, and the call that removes them."""

from __future__ import annotations

from pathlib import Path

import pytest

# The base test jobs install no framework; a store to erase from needs one.
pytest.importorskip("langchain_core")

from langchain_core.documents import Document
from langchain_core.embeddings import DeterministicFakeEmbedding
from langchain_core.vectorstores import InMemoryVectorStore
from typer.testing import CliRunner

import complydoc as cd
from complydoc.cli import app

IBAN = "GB29 NWBK 6016 1331 9268 19"

CHUNKS = [
    Document(page_content=f"Payroll goes to account {IBAN} every month."),
    Document(page_content="Termination needs thirty days notice in writing."),
    Document(page_content=f"Refunds are paid back to {IBAN} within a week."),
]


def _store_step(trail: cd.Trail):  # type: ignore[no-untyped-def]
    (run,) = trail.runs
    return next(step for step in run.steps if step.kind == "store")


def test_the_items_holding_a_value_are_named_with_the_call_that_removes_them(
    tmp_path: Path,
) -> None:
    store = InMemoryVectorStore(DeterministicFakeEmbedding(size=8))
    with cd.observe("ingest", out=tmp_path):
        ids = store.add_documents(CHUNKS)

    step = _store_step(cd.find_value(IBAN, tmp_path))
    # The first and the last chunk hold the account number; the middle one does not.
    assert step.ids == [ids[0], ids[2]]
    assert step.delete == f"vector_store.delete(ids={[ids[0], ids[2]]!r})"

    vector_store = store
    exec(step.delete)  # the call as printed removes exactly those items
    left = [doc.page_content for doc in vector_store.get_by_ids(ids)]
    assert left == [CHUNKS[1].page_content]


def test_ids_given_to_a_store_built_from_documents_are_kept(tmp_path: Path) -> None:
    with cd.observe("ingest", out=tmp_path):
        InMemoryVectorStore.from_documents(
            CHUNKS, DeterministicFakeEmbedding(size=8), ids=["a", "b", "c"]
        )
    assert _store_step(cd.find_value(IBAN, tmp_path)).ids == ["a", "c"]


def test_documents_that_carry_their_own_ids_are_stored_under_them(tmp_path: Path) -> None:
    documents = [Document(id=f"doc-{i}", page_content=c.page_content) for i, c in enumerate(CHUNKS)]
    with cd.observe("ingest", out=tmp_path):
        InMemoryVectorStore.from_documents(documents, DeterministicFakeEmbedding(size=8))
    assert _store_step(cd.find_value(IBAN, tmp_path)).ids == ["doc-0", "doc-2"]


class _Silent(InMemoryVectorStore):
    """A store that says nothing of where it kept what it was given."""

    def add_documents(self, documents: list[Document], **kwargs: object) -> list[str]:
        super().add_documents(documents, **kwargs)
        return None  # type: ignore[return-value]


def test_a_store_that_gives_no_ids_is_named_without_a_guess(tmp_path: Path) -> None:
    with cd.observe("ingest", out=tmp_path):
        _Silent(DeterministicFakeEmbedding(size=8)).add_documents(CHUNKS)
    step = _store_step(cd.find_value(IBAN, tmp_path))
    assert step.held and step.ids == [] and step.delete is None


def test_a_llamaindex_store_is_given_its_own_delete_call(tmp_path: Path) -> None:
    pytest.importorskip("llama_index.core")
    from llama_index.core import Document as LlamaDocument
    from llama_index.core import MockEmbedding
    from llama_index.core.ingestion import IngestionPipeline
    from llama_index.core.node_parser import SentenceSplitter
    from llama_index.core.vector_stores import SimpleVectorStore

    store = SimpleVectorStore()
    documents = [LlamaDocument(text=c.page_content) for c in CHUNKS]
    with cd.observe("ingest", out=tmp_path):
        nodes = IngestionPipeline(
            transformations=[
                SentenceSplitter(chunk_size=64, chunk_overlap=0),
                MockEmbedding(embed_dim=8),
            ],
            vector_store=store,
        ).run(documents=documents)

    step = _store_step(cd.find_value(IBAN, tmp_path))
    holding = [node.node_id for node in nodes if IBAN in node.get_content()]
    assert sorted(step.ids) == sorted(holding) and len(holding) == 2
    assert step.delete is not None and step.delete.startswith("vector_store.delete_nodes(node_ids=")
    store.delete_nodes(node_ids=step.ids)
    assert not set(holding) & set(store.data.embedding_dict)


def test_ids_a_store_built_from_documents_makes_itself_are_named(tmp_path: Path) -> None:
    # No `ids=`: the IDs come back from the `add_texts` the class method calls.
    with cd.observe("ingest", out=tmp_path):
        store = InMemoryVectorStore.from_documents(CHUNKS, DeterministicFakeEmbedding(size=8))
    step = _store_step(cd.find_value(IBAN, tmp_path))
    assert len(step.ids) == 2 and set(step.ids) <= set(store.store)


def test_a_value_in_an_items_metadata_names_that_item(tmp_path: Path) -> None:
    documents = [
        Document(page_content="Payroll runs monthly.", metadata={"account": IBAN}),
        Document(page_content="Termination needs thirty days notice."),
    ]
    with cd.observe("ingest", out=tmp_path):
        ids = InMemoryVectorStore(DeterministicFakeEmbedding(size=8)).add_documents(documents)
    assert _store_step(cd.find_value(IBAN, tmp_path)).ids == [ids[0]]


def test_two_collections_are_two_steps(tmp_path: Path) -> None:
    pytest.importorskip("langchain_chroma")
    from langchain_chroma import Chroma

    embedding = DeterministicFakeEmbedding(size=8)
    with cd.observe("ingest", out=tmp_path):
        Chroma(collection_name="people", embedding_function=embedding).add_documents(CHUNKS[:1])
        Chroma(collection_name="billing", embedding_function=embedding).add_documents(CHUNKS[2:])
    (run,) = cd.find_value(IBAN, tmp_path).runs
    stores = [s.store for s in run.steps if s.kind == "store"]
    assert stores == ["people", "billing"]


def test_numeric_ids_are_named(tmp_path: Path) -> None:
    class Numbered(InMemoryVectorStore):
        def add_documents(self, documents: list[Document], **kwargs: object) -> list[int]:  # type: ignore[override]
            super().add_documents(documents, ids=[str(i) for i in range(len(documents))])
            return list(range(len(documents)))

    with cd.observe("ingest", out=tmp_path):
        Numbered(DeterministicFakeEmbedding(size=8)).add_documents(CHUNKS)
    assert _store_step(cd.find_value(IBAN, tmp_path)).ids == ["0", "2"]


def test_an_id_that_holds_the_value_is_counted_not_named(tmp_path: Path) -> None:
    with cd.observe("ingest", out=tmp_path):
        InMemoryVectorStore(DeterministicFakeEmbedding(size=8)).add_documents(
            CHUNKS, ids=[f"account-{IBAN}", "b", "/home/ana/payroll.pdf#2"]
        )
    step = _store_step(cd.find_value(IBAN, tmp_path))
    assert step.ids == [] and step.withheld == 2 and step.delete is None
    report = next(tmp_path.rglob("*.json")).read_text()
    assert IBAN not in report and "/home/ana" not in report


def test_the_command_prints_the_items_and_the_call(tmp_path: Path) -> None:
    store = InMemoryVectorStore(DeterministicFakeEmbedding(size=8))
    with cd.observe("ingest", out=tmp_path):
        ids = store.add_documents(CHUNKS)
    result = CliRunner().invoke(app, ["find", IBAN, "--in", str(tmp_path)])
    assert result.exit_code == 0, result.output
    said = " ".join(result.output.split())
    assert f"stored as 2 items: {ids[0]}, {ids[2]}" in said
    # The call on a line of its own, so it is copied whole however narrow the terminal.
    assert f"to remove them: vector_store.delete(ids={[ids[0], ids[2]]!r})" in result.output
    assert IBAN not in said
