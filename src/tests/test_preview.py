"""Page wireframes carry no document content."""

from __future__ import annotations

import json

import pytest

from complydoc.config.loader import load_config
from complydoc.report.models import to_jsonable
from complydoc.report.preview import build_previews
from complydoc.sensitive.scanner import scan
from tests.helpers import FIXTURES


@pytest.fixture(scope="module")
def config():
    return load_config()


def previews_for(loader, config, name):
    document = loader(name)
    return document, build_previews(document, scan(document, config.sensitive))


# --- the guarantee ---------------------------------------------------------


def test_preview_carries_no_document_text(loader, config):
    """A thumbnail of the page would undo the masking. Geometry must be numbers only."""
    _, previews = previews_for(loader, config, "sensitive_sample.pdf")
    serialised = json.dumps(to_jsonable(previews))
    # Whole values, not fragments: masking keeps the last few characters of a
    # value on purpose, so "Doe" appears inside the mask of "Jane Doe" and
    # says nothing about whether the preview leaked anything.
    for secret in (
        "4111 1111 1111 1111",
        "AB123456C",
        "jane.doe@example.com",
        "GB82 WEST",
        "Jane Doe",
        "Acme Holdings",
    ):
        assert secret not in serialised, f"{secret!r} reached the preview data"


# --- placement -------------------------------------------------------------


def test_sensitive_values_are_placed_on_the_page(loader, config):
    _, previews = previews_for(loader, config, "sensitive_sample.pdf")
    page = previews[0]
    assert page.sensitive_count > 10
    assert page.unlocated_sensitive == 0
    assert len(page.sensitive) == page.sensitive_count


def test_placed_boxes_are_inside_the_page(loader, config):
    _, previews = previews_for(loader, config, "sensitive_sample.pdf")
    for box in previews[0].sensitive:
        assert 0.0 <= box.x <= 1.0
        assert 0.0 <= box.y <= 1.0
        assert 0.0 < box.w <= 1.0
        assert 0.0 < box.h <= 1.0


def test_high_severity_is_distinguishable(loader, config):
    _, previews = previews_for(loader, config, "sensitive_sample.pdf")
    labels = {b.label for b in previews[0].sensitive}
    assert "high" in labels


def test_a_match_that_cannot_be_placed_is_counted_not_dropped(loader, config):
    """DOCX carries no word geometry, so nothing can be positioned."""
    _, previews = previews_for(loader, config, "sample.docx")
    page = previews[0]
    assert page.sensitive_count > 0
    assert page.sensitive == []
    assert page.unlocated_sensitive == page.sensitive_count


def test_implausible_box_is_rejected(loader, config):
    """A run of words spanning most of a page is not one identifier."""
    from complydoc.ingest.base import Rect
    from complydoc.report.preview import _plausible

    document = loader("two_column.pdf")
    page = document.pages[0]
    assert _plausible(Rect(10, 100, 60, 110), page) is True
    assert _plausible(Rect(10, 100, page.width_pt - 10, 110), page) is False, "too wide"
    assert _plausible(Rect(10, 100, 60, 400), page) is False, "too tall"


# --- what the picture says -------------------------------------------------


def test_a_scan_is_all_image_and_no_text(loader, config):
    _, previews = previews_for(loader, config, "scanned_page.pdf")
    page = previews[0]
    assert page.image_coverage_pct > 90
    assert page.text_blocks == []
    assert page.image_blocks


def test_a_text_page_is_all_text_and_no_image(loader, config):
    _, previews = previews_for(loader, config, "native_text.pdf")
    page = previews[0]
    assert page.text_blocks
    assert page.image_blocks == []


def test_a_two_column_page_shows_its_gutter(loader, config):
    _, previews = previews_for(loader, config, "two_column.pdf")
    assert len(previews[0].gutters) == 1
    gutter = previews[0].gutters[0]
    assert 0.3 < gutter.x < 0.7, "the gutter should sit near the middle"


def test_a_single_column_page_has_no_gutter(loader, config):
    _, previews = previews_for(loader, config, "native_text.pdf")
    assert previews[0].gutters == []


def test_rotation_is_carried_through(loader, config):
    _, previews = previews_for(loader, config, "rotated_scan.pdf")
    assert previews[0].rotation == 90


def test_one_preview_per_page(loader, config):
    document, previews = previews_for(loader, config, "mixed_page_sizes.pdf")
    assert len(previews) == document.page_count == 3
    assert [p.number for p in previews] == [1, 2, 3]


# --- page images are opt-in ------------------------------------------------


def test_no_page_image_by_default(loader, config):
    """The default report is forwardable, so it carries no picture of the page."""
    document = loader("sensitive_sample.pdf")
    previews = build_previews(document, scan(document, config.sensitive))
    assert all(p.image_data_uri is None for p in previews)


def test_page_images_are_embedded_when_asked_for():
    from complydoc.ingest.base import IngestOptions
    from complydoc.ingest.registry import load_document

    document = load_document(
        FIXTURES / "sensitive_sample.pdf",
        IngestOptions(render_all_pages=True, max_render_pages=10),
    )
    previews = build_previews(document, None, page_images=True)
    assert previews[0].image_data_uri is not None
    assert previews[0].image_data_uri.startswith("data:image/jpeg;base64,")


def test_a_format_with_no_raster_gets_no_image(loader, config):
    """DOCX is never rasterised, so there is nothing to show beside the extraction."""
    document = loader("sample.docx")
    previews = build_previews(document, scan(document, config.sensitive), page_images=True)
    assert previews[0].image_data_uri is None


def test_a_sensitive_mark_explains_itself(loader, config):
    """A rectangle on a wireframe says only that something was found.

    Pointing at it should answer what it is, why it was reported, and why that
    matters — none of which is the value.
    """
    from complydoc.report.preview import build_previews
    from complydoc.sensitive.scanner import scan

    document = loader("sensitive_sample.pdf")
    result = scan(document, config.sensitive)
    previews = build_previews(document, result, categories=config.sensitive)

    marks = [box for preview in previews for box in preview.sensitive]
    assert marks, "the fixture carries locatable identifiers"
    for box in marks:
        assert box.title
        heading, reason, *rest = box.title.split("\n")
        assert "severity" in heading
        assert reason.startswith(("Reported", "Recognised"))
        assert rest, "and why it matters at all"


def test_the_explanation_never_carries_the_value(loader, config):
    """The wireframe explanation reproduces no content.

    Asserted on the explanation itself, because an organisation the model found
    may share words with a category's own label.
    """
    from complydoc.report.preview import _why_sensitive
    from complydoc.sensitive.scanner import scan

    document = loader("sensitive_sample.pdf")
    revealed = scan(document, config.sensitive, reveal=True)
    masked = scan(document, config.sensitive)

    assert any(m.revealed for m in revealed.matches), "there is something to leak"
    for hidden, shown in zip(masked.matches, revealed.matches, strict=True):
        assert _why_sensitive(hidden, config.sensitive) == _why_sensitive(
            shown, config.sensitive
        ), "the explanation changed when the value was unmasked"
        explanation = _why_sensitive(shown, config.sensitive)
        assert shown.masked not in explanation
        if shown.revealed and len(shown.revealed) > 6:
            assert shown.revealed not in explanation


def test_a_name_from_the_model_is_not_called_a_pattern(loader, config):
    from complydoc.report.preview import _why_sensitive
    from complydoc.sensitive.scanner import scan

    document = loader("sensitive_sample.pdf")
    result = scan(document, config.sensitive)
    ner = [m for m in result.matches if config.sensitive.categories[m.category].detector == "ner"]
    for match in ner:
        assert "pattern" not in _why_sensitive(match, config.sensitive)


# --- pictures cover what was found ------------------------------------------


def _rendered(name: str = "sensitive_sample.pdf"):
    from complydoc.ingest.base import IngestOptions
    from complydoc.ingest.registry import load_document

    return load_document(FIXTURES / name, IngestOptions(render_all_pages=True, max_render_pages=10))


def _picture(preview):
    import base64
    import io

    from PIL import Image

    assert preview.image_data_uri is not None
    return Image.open(io.BytesIO(base64.b64decode(preview.image_data_uri.split(",", 1)[1])))


def _darkness(picture, box) -> float:
    """The mean grey level under a mark's box: near 0 where it is blacked out."""
    x0, y0 = int(box.x * picture.width), int(box.y * picture.height)
    x1, y1 = int((box.x + box.w) * picture.width), int((box.y + box.h) * picture.height)
    from PIL import ImageStat

    return ImageStat.Stat(picture.crop((x0, y0, max(x1, x0 + 1), max(y1, y0 + 1)))).mean[0]


def test_a_picture_has_every_identifier_found_on_the_page_blacked_out(config):
    document = _rendered()
    scanned = scan(document, config.sensitive)
    page = build_previews(document, scanned, page_images=True)[0]
    assert page.sensitive, "the fixture has identifiers that can be placed"
    assert page.image_withheld == 0
    picture = _picture(page)
    # JPEG leaves a black box a few grey levels off black; printed text on white is far lighter.
    assert all(_darkness(picture, box) < 12 for box in page.sensitive)
    plain = _picture(build_previews(document, None, page_images=True)[0])
    assert all(_darkness(plain, box) > 60 for box in page.sensitive)


def test_a_run_that_reveals_values_keeps_its_pictures_as_the_pages_are(config):
    document = _rendered()
    revealed = scan(document, config.sensitive, reveal=True)
    page = build_previews(document, revealed, page_images=True)[0]
    picture = _picture(page)
    assert all(_darkness(picture, box) > 60 for box in page.sensitive)


def test_a_page_with_an_identifier_that_cannot_be_placed_has_no_picture(config):
    document = _rendered()
    scanned = scan(document, config.sensitive)
    # As a reader gives it where its words carry no positions: nothing can be covered.
    for page in document.pages:
        page.text_blocks.clear()
    page = build_previews(document, scanned, page_images=True)[0]
    assert page.image_data_uri is None
    # Every identifier found on it, those found only to be masked among them.
    found = [m for m in (*scanned.matches, *scanned.silent) if m.page == page.number]
    assert page.image_withheld == len(found) > 0


def test_what_was_found_only_to_be_masked_is_blacked_out_too(config):
    from complydoc.report.preview import _locate_all, _value_at

    document = _rendered()
    silent = config.sensitive.model_copy(
        update={
            "categories": {
                name: category.model_copy(update={"silent": True})
                for name, category in config.sensitive.categories.items()
            }
        }
    )
    scanned = scan(document, silent)
    assert scanned.matches == [] and scanned.silent
    page = build_previews(document, scanned, page_images=True)[0]
    # Nothing is reported on the page, and its picture still covers what was found.
    assert page.sensitive == [] and page.sensitive_count == 0
    picture = _picture(page)
    first = document.pages[0]
    match = scanned.silent[0]
    (rect, *_) = _locate_all(_value_at(first, match.line, match.column, match.length), first)
    box = picture.crop(
        (
            int(rect.x0 / first.width_pt * picture.width),
            int(rect.y0 / first.height_pt * picture.height),
            int(rect.x1 / first.width_pt * picture.width),
            int(rect.y1 / first.height_pt * picture.height),
        )
    )
    from PIL import ImageStat

    assert ImageStat.Stat(box).mean[0] < 12
