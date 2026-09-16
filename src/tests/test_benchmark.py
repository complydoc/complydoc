"""The accuracy benchmark, and the corpus it scores against."""

from __future__ import annotations

import pytest

from complydoc.benchmark import load_corpus, run_benchmark
from tests.helpers import spacy_model_available

# The numbers published in docs/explanation/accuracy.md. A change in detection
# that moves them fails here, so the page cannot quietly go out of date.
PUBLISHED = {
    "passages": 41,
    "labelled": 53,
    "found": 52,
    "missed": 1,
    "wrongly_flagged": 5,
    "recall_pct": 98.1,
    "precision_pct": 91.2,
    "clean_passages": 9,
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


def test_the_published_numbers_cannot_move_with_the_name_model(result):
    """What lets one number mean the same thing on two machines.

    Names come from whichever model is installed, so every count the page
    publishes is taken from the pattern-backed categories alone.
    """
    assert result.model_backed, "the shipped configuration has model-backed categories"
    assert {"person_name", "organisation_name"} <= result.model_backed
    assert all(score.category not in result.model_backed for score in result.measured)
    assert "model" not in result.by_evidence, "the evidence counts are published"


def test_names_are_scored_in_their_own_group(result):
    if not spacy_model_available():
        pytest.skip("no name model installed, so there is nothing to score")
    assert result.names_measured
    assert result.names_labelled == 15
    assert result.model_name


def test_the_corpus_holds_passages_that_should_report_nothing(result):
    """Without them the benchmark would measure recall and call it accuracy."""
    assert result.clean_passages >= 8
