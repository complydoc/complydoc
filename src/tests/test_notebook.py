"""Reports as tables and as notebook output."""

from __future__ import annotations

import sys

import pytest

import complydoc as cd
from complydoc.report.tables import COLUMNS, TABLES, summary_html, table_rows
from tests.helpers import FIXTURES


@pytest.fixture(scope="module")
def report():
    return cd.full_audit(FIXTURES / "sensitive_sample.pdf", extracted_text=True)


@pytest.fixture(scope="module")
def comparison():
    pages = [
        {"page_content": "Contact jane.doe@example.com.", "metadata": {"source": "/tmp/a.pdf"}}
    ]
    empty = [{"page_content": "Contact the office.", "metadata": {"source": "/tmp/a.pdf"}}]
    return cd.compare_loaders({"first": pages, "second": empty})


def test_every_table_is_declared():
    assert set(TABLES) == set(COLUMNS)


@pytest.mark.parametrize("table", ["documents", "pages", "identifiers", "signals", "limitations"])
def test_rows_follow_the_declared_columns(report, table):
    rows = table_rows(report, table)
    assert rows
    assert all(tuple(row) == COLUMNS[table] for row in rows)


@pytest.mark.parametrize("table", ["loaders", "differences"])
def test_comparison_tables(comparison, table):
    rows = table_rows(comparison, table)
    assert rows
    assert all(tuple(row) == COLUMNS[table] for row in rows)


def test_identifier_values_are_masked(report):
    values = [row["value"] for row in table_rows(report, "identifiers")]
    assert values
    assert all("•" in value for value in values)


def test_an_unknown_table_is_rejected(report):
    with pytest.raises(ValueError, match="unknown table"):
        table_rows(report, "nope")


def test_the_summary_renders_and_escapes(report):
    html = report._repr_html_()
    assert html == summary_html(report)
    assert "<th style='text-align:left;padding-right:1em'>Documents</th>" in html
    assert "report.to_pandas(table)" in html


def test_to_pandas_uses_the_declared_columns(report):
    pytest.importorskip("pandas")
    frame = report.to_pandas("identifiers")
    assert list(frame.columns) == list(COLUMNS["identifiers"])
    assert len(frame) == len(table_rows(report, "identifiers"))


def test_an_empty_table_keeps_its_columns(report):
    pytest.importorskip("pandas")
    frame = report.to_pandas("differences")
    assert frame.empty
    assert list(frame.columns) == list(COLUMNS["differences"])


def test_a_missing_pandas_says_how_to_install_it(report, monkeypatch):
    monkeypatch.setitem(sys.modules, "pandas", None)
    with pytest.raises(ImportError, match=r"complydoc\[notebook\]"):
        report.to_pandas()
