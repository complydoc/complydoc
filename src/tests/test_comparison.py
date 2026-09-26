"""Architecture cost comparison: what each way of reading the folder costs, and reaches."""

from __future__ import annotations

import pytest

from complydoc.audit.run import run_audit
from complydoc.cost.comparison import ARCHITECTURES, build_comparison
from tests.helpers import FIXTURES, requires_ocr


@pytest.fixture(scope="module")
def comparisons(config):
    return build_comparison(run_audit(FIXTURES, config, ocr=True, monthly_volume=1000))


def test_every_priced_model_is_compared(comparisons, config):
    assert {c.model_id for c in comparisons} == {m.id for m in config.pricing.usable_models}


def test_all_three_architectures_are_costed(comparisons):
    for comparison in comparisons:
        assert [a.key for a in comparison.architectures] == [k for k, _ in ARCHITECTURES]


def test_vision_costs_more_than_text(comparisons):
    """Where a model can do both. Some read text only, and have no vision cost
    at all."""
    compared = 0
    for comparison in comparisons:
        text = comparison.by_key("text_ocr")
        vision = comparison.by_key("vision")
        if text.folder_usd is None or vision.folder_usd is None:
            continue
        compared += 1
        assert vision.folder_usd > text.folder_usd, comparison.model_id
    assert compared, "no model in the comparison could do both"


def test_a_text_only_model_has_no_vision_cost_rather_than_zero(comparisons):
    """It is a real choice for the cheapest path, and free is not what it is."""
    text_only = [c for c in comparisons if c.by_key("vision").folder_usd is None]
    for comparison in text_only:
        vision = comparison.by_key("vision")
        assert vision.folder_usd is None
        assert vision.per_1000_usd is None
        assert comparison.by_key("text_ocr").folder_usd is not None


@requires_ocr
def test_ocr_reaches_more_documents_than_the_text_layer_alone(comparisons):
    """OCR reaches documents the text layer alone cannot."""
    for comparison in comparisons:
        assert (
            comparison.by_key("text_ocr").documents_served
            > comparison.by_key("text_layer").documents_served
        )


def test_reach_never_exceeds_the_folder(comparisons):
    for comparison in comparisons:
        for architecture in comparison.architectures:
            assert 0 <= architecture.documents_served <= architecture.documents_total


def test_cost_scales_with_price(comparisons):
    by_id = {c.model_id: c for c in comparisons}
    opus = by_id["claude-opus-5-5"].by_key("vision").folder_usd
    haiku = by_id["claude-haiku-4-5"].by_key("vision").folder_usd
    assert opus == pytest.approx(haiku * 4, rel=1e-6)


def test_annual_needs_a_volume(config):
    without = build_comparison(run_audit(FIXTURES, config, ocr=True))
    assert all(a.annual_usd is None for c in without for a in c.architectures)


# --- the drawing -----------------------------------------------------------
