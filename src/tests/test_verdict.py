"""Which loader a comparison recommends, and when it refuses to.

The refusal is the part worth testing hardest. Two loaders that read a page in
different orders produce different text, and nothing in the text says which
order is right, so a run without an expected fact has to say so rather than
pick the quicker of two readings.
"""

from __future__ import annotations

import pytest

from complydoc.loaders.verdict import recommend
from complydoc.report.models import FactCheck, LoaderComparison, LoaderSummary


def loader(name: str, **overrides) -> LoaderSummary:
    settings = {
        "name": name,
        "documents": 3,
        "pages": 3,
        "characters": 900,
        "seconds": 0.10,
        "network_allowed": False,
        "network_attempts": [],
        "error": None,
        "metadata_keys": [],
        "identifiers_in_text": 0,
        "identifiers_in_metadata": 0,
        "documents_with_paths": 0,
        "readiness_score": 90.0,
        "global_score": 90.0,
        "text_path_usd": None,
    }
    settings.update(overrides)
    return LoaderSummary(**settings)


def comparison(*loaders: LoaderSummary, facts: list[FactCheck] | None = None) -> LoaderComparison:
    return LoaderComparison(baseline=loaders[0].name, loaders=list(loaders), facts=facts or [])


class Document:
    """A report entry, as the verdict reads it."""

    def __init__(self, path: str, disagrees: bool) -> None:
        self.relative_path = path
        self.extractors_disagree = disagrees


def test_a_loader_that_could_not_open_a_file_loses():
    verdict = recommend(
        comparison(
            loader("pypdf"),
            loader("pdfplumber", failures={"a.pdf": "boom"}, documents=2),
        ),
        [Document("a.pdf", False)],
    )
    assert verdict.recommended == "pypdf"
    assert "raised on 1" in verdict.reason
    assert verdict.ranked == ["pypdf", "pdfplumber"]


def test_the_loader_that_kept_the_expected_fact_wins():
    check = FactCheck(
        fact="the total is 12,480.00",
        document=None,
        found={"pypdf": "exact", "other": None},
        scores={"pypdf": 1.0, "other": 0.84},
        pages={"pypdf": 1, "other": None},
        documents={"pypdf": "invoice.pdf", "other": None},
    )
    verdict = recommend(
        comparison(loader("pypdf", facts_found=1), loader("other", facts_found=0), facts=[check]),
        [Document("invoice.pdf", True)],
    )
    assert verdict.recommended == "pypdf"
    assert "kept 1 of 1 expected fact" in verdict.reason


def test_a_disagreement_alone_decides_nothing():
    """The readings differ; which one is right is not in the text."""
    verdict = recommend(
        comparison(loader("pypdf"), loader("pdfplumber", seconds=0.01)),
        [Document("contract.pdf", True)],
    )
    assert verdict.recommended is None
    assert "read 1 document differently" in verdict.reason
    assert "as a fact" in verdict.reason, "it says how to settle the question"


def test_loaders_that_agree_are_separated_by_time():
    verdict = recommend(
        comparison(loader("slow", seconds=0.40), loader("quick", seconds=0.05)),
        [Document("invoice.pdf", False)],
    )
    assert verdict.recommended == "quick"
    assert "same text" in verdict.reason and "quickest" in verdict.reason


def test_loaders_that_agree_and_tie_on_time_leave_the_choice_open():
    verdict = recommend(
        comparison(loader("one", seconds=0.10), loader("two", seconds=0.10)),
        [Document("invoice.pdf", False)],
    )
    assert verdict.recommended is None
    assert "take either" in verdict.reason


@pytest.mark.parametrize("count", [0, 1])
def test_nothing_to_compare_is_said_plainly(count):
    verdict = recommend(comparison(*[loader(f"l{i}") for i in range(count)] or [loader("one")]), [])
    assert verdict.recommended is None
    assert "nothing to compare" in verdict.reason
