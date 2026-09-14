"""Signals measured on text alone, which also apply to loader output."""

from __future__ import annotations

from pathlib import Path

import pytest

from complydoc.ingest.base import Document, DocumentFormat, Page
from complydoc.readiness.analyser import analyse
from complydoc.readiness.base import SignalStatus

PROSE = "The supplier delivers goods within thirty days of an accepted purchase order. "


def document(*pages: str) -> Document:
    doc = Document(path=Path("x.pdf"), sha256="", format=DocumentFormat.PDF)
    for number, text in enumerate(pages, start=1):
        page = Page(number=number, width_pt=595.0, height_pt=842.0)
        page.text = text
        page.text_source = "loader"
        doc.pages.append(page)
    return doc


def result(doc: Document, config, signal_id: str):
    return next(s for s in analyse(doc, config.readiness).signals if s.id == signal_id)


def test_glyph_codes_rate_poor(config):
    signal = result(document(PROSE * 10 + "(cid:12) " * 20), config, "unmapped_glyphs")
    assert signal.detail["cid_codes"] == 20
    assert signal.rating == "poor"


def test_private_use_characters_are_counted(config):
    signal = result(document(PROSE * 10 + "" * 3), config, "unmapped_glyphs")
    assert signal.detail["private_use_characters"] == 3


def test_clean_text_has_no_unmapped_glyphs(config):
    signal = result(document(PROSE * 10), config, "unmapped_glyphs")
    assert (signal.value, signal.rating) == (0.0, "good")


def test_short_text_is_not_measured(config):
    signal = result(document("Too short."), config, "unmapped_glyphs")
    assert signal.status is SignalStatus.NOT_APPLICABLE


def test_hyphenated_line_breaks_are_counted(config):
    text = (PROSE + "deliv-\nery ") * 20
    signal = result(document(text), config, "hyphenated_line_breaks")
    assert signal.detail["split_words"] == 20
    assert signal.rating == "poor"


def test_a_hyphen_inside_a_line_is_not_a_break(config):
    signal = result(
        document((PROSE + "well-known supplier ") * 20), config, "hyphenated_line_breaks"
    )
    assert signal.value == 0.0


@pytest.mark.parametrize("pages", [5, 8])
def test_running_headers_and_footers_are_repeated_lines(config, pages):
    doc = document(
        *(
            f"HARBOUR LOGISTICS CONFIDENTIAL\n{PROSE}Body text unique to page {n} "
            f"with its own words {'x' * n}.\nPage {n} of {pages}"
            for n in range(1, pages + 1)
        )
    )
    signal = result(doc, config, "repeated_page_lines")
    assert signal.detail["repeated_lines"] == 2, "the header and the page footer"
    assert signal.value > 0


def test_repeated_lines_need_several_pages(config):
    signal = result(document(PROSE, PROSE), config, "repeated_page_lines")
    assert signal.status is SignalStatus.NOT_APPLICABLE
