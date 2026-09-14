"""Expected facts in extracted text."""

from __future__ import annotations

import pytest

import complydoc as cd
from complydoc.facts import find_fact, normalise

CLAUSE = "Payment is due within thirty days of the invoice date."


def test_normalisation_ignores_case_spacing_and_line_break_hyphens():
    assert normalise("Pay-\n ment  IS​ due") == "payment is due"


def test_an_exact_match_reports_its_page():
    match = find_fact([(1, "Cover page."), (2, "Terms. " + CLAUSE)], CLAUSE)
    assert (match.kind, match.score, match.page) == ("exact", 1.0, 2)


def test_a_small_difference_is_a_fuzzy_match():
    match = find_fact([(1, "Payment is due withn thirty days of the invoice date.")], CLAUSE)
    assert match.kind == "fuzzy"
    assert 0.9 <= match.score < 1.0


def test_a_different_passage_is_not_found():
    match = find_fact([(1, "Goods are delivered within five working days.")], CLAUSE)
    assert match.kind is None
    assert match.page is None


def test_facts_are_limited_to_their_document():
    report = cd.inspect_documents(
        [
            {"page_content": CLAUSE, "metadata": {"source": "/tmp/facts/a.pdf"}},
            {"page_content": "Nothing relevant.", "metadata": {"source": "/tmp/facts/b.pdf"}},
        ]
    )
    anywhere, only_b = cd.check_facts(report, [CLAUSE, cd.Fact(CLAUSE, document="b.pdf")])
    assert anywhere.found == {"documents": "exact"}
    assert anywhere.documents == {"documents": "a.pdf"}
    assert only_b.found == {"documents": None}


def test_a_report_without_extracted_text_is_rejected():
    report = cd.inspect_documents(
        [{"page_content": CLAUSE, "metadata": {"source": "/tmp/facts/a.pdf"}}],
        extracted_text=False,
    )
    with pytest.raises(ValueError, match="extracted_text=True"):
        cd.check_facts(report, [CLAUSE])


def test_an_empty_fact_is_rejected():
    report = cd.inspect_documents([{"page_content": CLAUSE}])
    with pytest.raises(ValueError, match="cannot be empty"):
        cd.check_facts(report, ["  "])
