"""The accuracy benchmark, and the corpus it scores against."""

from __future__ import annotations

import pytest

from complydoc.benchmark import load_corpus, run_benchmark

# The numbers published in docs/explanation/accuracy.md. A change in detection
# that moves them fails here, so the page cannot quietly go out of date.
PUBLISHED = {
    "passages": 32,
    "labelled": 50,
    "found": 49,
    "missed": 1,
    "wrongly_flagged": 5,
    "recall_pct": 98.0,
    "precision_pct": 90.7,
    "clean_passages": 8,
    "clean_passages_with_a_flag": 3,
}
DOCS = "docs/explanation/accuracy.md"


@pytest.fixture(scope="module")
def result(config):
    return run_benchmark(config.sensitive)


def test_the_published_numbers_still_hold(result):
    measured = {
        "passages": result.passages,
        "labelled": result.labelled_total,
        "found": result.found_total,
        "missed": result.missed_total,
        "wrongly_flagged": result.wrongly_flagged_total,
        "recall_pct": result.recall_pct,
        "precision_pct": result.precision_pct,
        "clean_passages": result.clean_passages,
        "clean_passages_with_a_flag": result.clean_passages_with_a_flag,
    }
    assert measured == PUBLISHED, f"detection changed; update {DOCS} and this test to match"


def test_every_labelled_value_occurs_in_its_passage():
    """A label naming a value the passage does not contain would score a phantom miss."""
    for passage in load_corpus():
        for _, value in passage.expect:
            assert value in passage.text, f"{passage.id} labels {value!r}, which is not in it"


def test_passage_ids_are_unique():
    ids = [passage.id for passage in load_corpus()]
    assert len(ids) == len(set(ids))


def test_names_are_left_out_whether_or_not_a_model_is_installed(result):
    """Scoring them would tie the published numbers to what happens to be installed."""
    for category in ("person_name", "organisation_name"):
        assert result.categories[category].unmeasured
        assert result.categories[category].found == 0
        assert result.categories[category].wrongly_flagged == 0


def test_the_corpus_holds_passages_that_should_report_nothing(result):
    """Without them the benchmark would measure recall and call it accuracy."""
    assert result.clean_passages >= 8
