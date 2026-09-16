"""Whether a table survived extraction as a table."""

from __future__ import annotations

import pytest

import complydoc as cd
from complydoc.ingest.base import IngestOptions
from complydoc.ingest.fidelity import compare_rows
from complydoc.ingest.registry import load_document
from tests.helpers import FIXTURES

GRID = [
    ["Supplier", "Rating", "Spend"],
    ["Acme Holdings", "B", "48,200"],
    ["Globex Partners", "C", "96,400"],
]


def test_rows_on_their_own_lines_are_intact():
    text = "Supplier Rating Spend\nAcme Holdings B 48,200\nGlobex Partners C 96,400\n"
    assert compare_rows(GRID, text) == (3, 3)


def test_a_table_read_column_by_column_keeps_no_rows():
    text = "Supplier\nAcme Holdings\nGlobex Partners\nRating\nB\nC\nSpend\n48,200\n96,400\n"
    assert compare_rows(GRID, text) == (0, 3)


def test_a_row_whose_cells_wrap_to_two_lines_is_not_intact():
    grid = [["Supplier", "Notes"], ["Acme Holdings Limited", "Renewal due in March"]]
    text = "Supplier Notes\nAcme Holdings Renewal due in\nLimited March\n"
    assert compare_rows(grid, text) == (1, 2)


def test_cells_are_matched_as_whole_words():
    # "B" is a rating, and must not match the B in "Bank".
    assert compare_rows([["Acme", "B"]], "Acme Bank plc\n") == (0, 1)


def test_the_order_of_the_cells_matters():
    assert compare_rows([["Supplier", "Rating"]], "Rating Supplier\n") == (0, 1)


def test_rows_with_nothing_to_lose_are_not_counted():
    assert compare_rows([["Total"], [""], [None, "  "]], "Total\n") == (0, 0)
    assert compare_rows([], "anything") == (0, 0)
    assert compare_rows(GRID, "   ") == (0, 0)


def test_the_loader_measures_a_ruled_table():
    document = load_document(
        FIXTURES / "merged_header_table.pdf", IngestOptions(extract_tables=True)
    )
    [table] = [t for page in document.pages for t in page.tables]
    assert table.rows_compared, "a ruled table should have been checked against the text"
    assert table.fidelity_pct == 100.0


@pytest.mark.parametrize("extractor", ["pdfium", "pypdf"])
def test_an_extractor_that_reads_no_tables_measures_nothing(extractor):
    """Table detection only runs for an extractor that reads table structure.

    So there is no grid to compare, and the signal says so rather than reporting a
    score for a reading it never made.
    """
    document = load_document(
        FIXTURES / "merged_header_table.pdf",
        IngestOptions(extract_tables=True, extractor=extractor),
    )
    assert [t for page in document.pages for t in page.tables] == []


def test_the_signal_reports_the_share_of_rows(config):
    report = cd.readiness_audit(FIXTURES / "column_major_table.pdf", config=config)
    signal = next(s for s in report.documents[0].readiness.signals if s.id == "table_fidelity")
    assert signal.value == 100.0
    assert signal.rating == "good"
    assert signal.detail["rows_compared"] == 5


def test_the_signal_is_not_applicable_without_an_extractor_that_reads_tables(config):
    report = cd.readiness_audit(
        FIXTURES / "column_major_table.pdf", config=config, extractor="pdfium"
    )
    signal = next(s for s in report.documents[0].readiness.signals if s.id == "table_fidelity")
    assert signal.value is None
    assert "does not read table structure" in (signal.reason or "")


def test_an_alignment_detected_table_is_not_scored(config):
    """Alignment is a guess about where the columns are; its rows prove nothing."""
    report = cd.readiness_audit(FIXTURES / "whitespace_table.pdf", config=config)
    signal = next(s for s in report.documents[0].readiness.signals if s.id == "table_fidelity")
    assert signal.value is None
    assert "alignment" in (signal.reason or "")
