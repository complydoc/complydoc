"""Inspecting chunks from text splitters."""

from __future__ import annotations

import pytest

import complydoc as cd

SOURCE = "/tmp/chunks/contract.pdf"
CLAUSE = "Payment is due within thirty days of the invoice date."


class Doc:
    def __init__(self, page_content: str, metadata: dict | None = None) -> None:
        self.page_content = page_content
        self.metadata = metadata or {}


def paragraphs(documents):
    """A splitter that makes one chunk per paragraph."""
    return [
        Doc(part, dict(d.metadata))
        for d in documents
        for part in d.page_content.split("\n\n")
        if part.strip()
    ]


class LangChainStyle:
    def split_documents(self, documents):
        return paragraphs(documents)


class LlamaIndexStyle:
    def get_nodes_from_documents(self, documents):
        return paragraphs(documents)


TEXT = "\n\n".join(
    [
        "Terms of supply between the parties named below, agreed in March.",
        "Payment is due within thirty",
        "days of the invoice date. Contact jane.doe@example.com for questions.",
        "Name | Amount |",
        "| Widgets | 10 |",
        "Final remarks about delivery.\nDELIVERY TERMS",
        "Terms of supply between the parties named below, agreed in March.",
    ]
)


def documents():
    return [Doc(TEXT, {"source": SOURCE, "page": 0})]


@pytest.fixture(scope="module")
def report():
    return cd.inspect_chunks(paragraphs, documents(), min_tokens=8, max_tokens=12, facts=[CLAUSE])


def flags(report, index):
    return report.chunks[index].flags


def test_one_inspected_chunk_per_chunk(report):
    assert report.stats.count == 7
    assert [c.index for c in report.chunks] == list(range(7))
    assert report.chunks[0].document == SOURCE
    assert report.chunks[0].page == 1


def test_a_sentence_cut_between_chunks_is_flagged(report):
    assert "split_sentence" in flags(report, 1)
    assert "split_sentence" not in flags(report, 2)


def test_a_table_cut_between_chunks_is_flagged(report):
    assert "split_table" in flags(report, 3)


def test_a_heading_left_at_the_end_is_flagged(report):
    assert "heading_at_end" in flags(report, 5)


def test_a_repeated_chunk_is_a_duplicate(report):
    assert "duplicate" in flags(report, 6)
    assert "duplicate" not in flags(report, 0)


def test_small_and_large_chunks_are_flagged(report):
    assert "tiny" in flags(report, 4)
    assert report.flag_counts["oversized"] >= 1


def test_identifiers_are_masked_in_chunks(report):
    chunk = report.chunks[2]
    assert any(value.startswith("Email") for value in chunk.identifiers)
    assert "jane.doe@example.com" not in chunk.preview


def test_a_fact_split_across_chunks_is_reported(report):
    (location,) = report.facts
    assert (location.status, location.chunks) == ("split", [])


def test_a_fact_inside_one_chunk_is_whole():
    whole = cd.inspect_chunks(
        paragraphs, [Doc(CLAUSE + "\n\nOther text.", {"source": SOURCE})], facts=[CLAUSE]
    )
    assert (whole.facts[0].status, whole.facts[0].chunks) == ("whole", [0])


def test_absolute_paths_in_metadata_are_flagged():
    report = cd.inspect_chunks(
        [Doc("Some text here for the chunk.", {"source": "/Users/someone/a.pdf"})]
    )
    assert "path_metadata" in report.chunks[0].flags
    assert report.chunker == "chunks"


def test_identifiers_repeated_across_chunks_are_counted():
    chunks = [Doc("Write to jane.doe@example.com."), Doc("Or jane.doe@example.com again.")]
    report = cd.inspect_chunks(chunks)
    assert list(report.repeated_identifiers.values()) == [2]


@pytest.mark.parametrize("splitter", [LangChainStyle(), LlamaIndexStyle(), paragraphs])
def test_splitter_shapes(splitter):
    assert cd.inspect_chunks(splitter, documents()).stats.count == 7


def test_a_loader_can_supply_the_documents():
    class Loader:
        def load(self):
            return documents()

    assert cd.inspect_chunks(paragraphs, Loader()).stats.count == 7


def test_an_unusable_splitter_is_rejected():
    with pytest.raises(TypeError, match="cannot split"):
        cd.inspect_chunks(object(), documents())


def test_splitters_are_compared_side_by_side():
    comparison = cd.compare_chunkers(
        {"paragraphs": paragraphs, "whole": lambda docs: list(docs)}, documents(), facts=[CLAUSE]
    )
    rows = {row["chunker"]: row for row in comparison.rows()}
    assert rows["paragraphs"]["chunks"] == 7 and rows["whole"]["chunks"] == 1
    assert rows["paragraphs"]["facts_split"] == 1 and rows["whole"]["facts_whole"] == 1


def test_comparing_needs_two_splitters():
    with pytest.raises(ValueError, match="at least two"):
        cd.compare_chunkers({"one": paragraphs}, documents())


def test_tables_as_dataframes(report):
    pytest.importorskip("pandas")
    assert len(report.to_pandas()) == 7
    comparison = cd.compare_chunkers({"a": paragraphs, "b": paragraphs}, documents())
    assert list(comparison.to_pandas()["chunker"]) == ["a", "b"]
