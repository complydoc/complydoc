"""Routes in the report: per document, for the folder, and priced against the alternatives."""

from __future__ import annotations

import pytest

import complydoc as cd
from complydoc.extraction.routing import ROUTES
from tests.helpers import FIXTURES


@pytest.fixture(scope="module")
def report(config):
    return cd.full_audit(FIXTURES, ocr=False, config=config)


def test_every_document_carries_a_route_for_every_page(report):
    for document in report.documents:
        assert document.routing is not None, document.relative_path
        assert len(document.routing.pages) == document.page_count
        assert {page.route for page in document.routing.pages} <= set(ROUTES)
        assert all(page.reason for page in document.routing.pages)


def test_a_scanned_page_with_no_text_layer_is_not_routed_to_the_text_layer(report):
    scan = next(d for d in report.documents if d.relative_path == "scanned_page.pdf")
    assert [page.route for page in scan.routing.pages] != ["text"]
    assert scan.routing.route in ("ocr", "vision")


def test_a_text_document_stays_on_its_text_layer(report):
    native = next(d for d in report.documents if d.relative_path == "native_text.pdf")
    assert native.routing.route == "text"


def test_the_folder_summary_counts_pages_and_documents(report):
    summary = report.routing
    assert summary is not None
    assert sum(summary.pages.values()) == sum(d.page_count for d in report.documents)
    assert summary.documents_routed == len(report.documents)
    # An encrypted PDF opens with no pages, so it takes no route and is counted apart
    # rather than quietly missing from the buckets.
    assert summary.documents_without_pages == 1
    assert sum(summary.documents.values()) + summary.documents_without_pages == (
        summary.documents_routed
    )
    assert "hold no pages" in summary.basis


def test_the_mix_is_priced_against_the_three_architectures(report):
    summary = report.routing
    assert summary.model_name and summary.resolution
    assert summary.routed_usd is not None
    assert summary.vision_usd is not None
    # Routing exists to avoid paying the vision price for pages that do not need it.
    assert summary.routed_usd <= summary.vision_usd
    assert summary.saved_against_vision_usd >= 0
    assert "priced by the route it needs" in summary.basis


def test_routes_are_reported_without_the_cost_component(config):
    report = cd.security_audit(FIXTURES / "native_text.pdf", config=config)
    assert report.documents[0].routing is not None
    assert report.routing is not None
    assert report.routing.routed_usd is None
    assert "not priced" in report.routing.basis


def test_the_routes_survive_a_round_trip_through_json(report, tmp_path):
    loaded = cd.load_report(cd.write_json(report, tmp_path / "report.json"))
    first = loaded.documents[0].routing
    assert first is not None
    assert [p.route for p in first.pages] == [p.route for p in report.documents[0].routing.pages]
    assert loaded.routing.pages == report.routing.pages
    assert loaded.routing.routed_usd == report.routing.routed_usd
