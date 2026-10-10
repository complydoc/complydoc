"""Deciding whether a page needs its text layer, OCR, or a vision model."""

from __future__ import annotations

import pytest

from complydoc.config.schema import RoutingConfig
from complydoc.extraction.routing import plan_routes
from complydoc.ingest.base import (
    Document,
    DocumentFormat,
    ImageBlock,
    Page,
    Rect,
    TableInfo,
    TextBlock,
)

WIDTH, HEIGHT = 612.0, 792.0


def page(
    number: int = 1,
    *,
    text: str = "",
    source: str = "native",
    text_share: float = 0.0,
    image_share: float = 0.0,
    dpi: float | None = None,
    ocr_confidence: float | None = None,
    tables: list[TableInfo] | None = None,
) -> Page:
    """A page covered by the shares given, with an image at `dpi` when asked for."""
    built = Page(number=number, width_pt=WIDTH, height_pt=HEIGHT, text=text)
    built.text_source = source  # type: ignore[assignment]
    if text_share:
        built.text_blocks = [TextBlock(text=text, bbox=Rect(0, 0, WIDTH * text_share, HEIGHT))]
    if image_share:
        width_pt = WIDTH * image_share
        built.image_blocks = [
            ImageBlock(
                bbox=Rect(0, 0, width_pt, HEIGHT),
                width_px=int(dpi * width_pt / 72.0) if dpi else None,
                height_px=int(dpi * HEIGHT / 72.0) if dpi else None,
            )
        ]
    built.ocr_confidence = ocr_confidence
    built.tables = tables or []
    return built


def document(*pages: Page) -> Document:
    return Document(
        path="folder/file.pdf",  # type: ignore[arg-type]
        sha256="0" * 64,
        format=DocumentFormat.PDF,
        pages=list(pages),
    )


def route_of(built: Page) -> tuple[str, str]:
    [decided] = plan_routes(document(built)).pages
    return decided.route, decided.reason


PROSE = "Terms of supply between the parties named below, agreed in March. " * 5


def test_a_page_with_a_text_layer_reads_from_the_text_layer():
    route, reason = route_of(page(text=PROSE, text_share=0.6))
    assert route == "text"
    assert "text layer covering 60%" in reason


def test_a_table_with_merged_cells_goes_to_a_vision_model():
    table = TableInfo(rows=4, cols=3, header_depth=1, merged_cells=2)
    route, reason = route_of(page(text=PROSE, text_share=0.6, tables=[table]))
    assert route == "vision"
    assert "merged or stacked header cells" in reason


def test_stacked_headers_go_to_a_vision_model_too():
    table = TableInfo(rows=6, cols=4, header_depth=2, merged_cells=0)
    assert route_of(page(text=PROSE, text_share=0.5, tables=[table]))[0] == "vision"


def test_a_plain_table_stays_on_the_text_layer():
    table = TableInfo(rows=6, cols=2, header_depth=1, merged_cells=0)
    assert route_of(page(text=PROSE, text_share=0.5, tables=[table]))[0] == "text"


CAPTION = "Figure 1. Quarterly revenue by product line, in thousands of pounds."


def test_a_caption_on_a_picture_goes_to_a_vision_model():
    route, reason = route_of(page(text=CAPTION, text_share=0.05, image_share=0.9))
    assert route == "vision"
    assert "mostly picture" in reason


def test_a_scan_with_no_text_layer_goes_to_a_vision_model():
    """OCR kept far less of such pages than a vision model on both benchmarks measured."""
    route, reason = route_of(page(source="none", image_share=0.95, dpi=300))
    assert route == "vision"
    assert "300 dpi" in reason
    assert "no text layer" in reason


def test_a_page_ocr_already_read_still_goes_to_a_vision_model():
    built = page(source="ocr", text=PROSE, image_share=0.95, dpi=300, ocr_confidence=0.93)
    assert route_of(built)[0] == "vision"


def test_an_empty_page_with_no_picture_is_recognised():
    route, reason = route_of(page(source="none"))
    assert route == "vision"
    assert "no usable text layer" in reason


def test_a_text_layer_of_unmapped_characters_is_not_text():
    """A font with no usable mapping to Unicode: the layer is there and says nothing."""
    garbled = ("\x01\x01\x01\x01 \x01\x01\x01 " * 40).strip()
    route, reason = route_of(page(text=garbled, text_share=0.6))
    assert route == "vision"
    assert "control or unmapped characters" in reason


def test_a_text_layer_of_noise_is_not_text():
    """An embedded OCR layer that read marks on the page, or letters mapped to punctuation."""
    noise = (".- -,,.;; ::: 1# -i' .:|r ' .:.' .::.: " * 12).strip()
    route, reason = route_of(page(text=noise, text_share=0.6))
    assert route == "vision"
    assert "tokens are words" in reason


def test_prose_in_another_alphabet_is_text():
    greek = "Οι όροι προμήθειας μεταξύ των μερών που αναφέρονται παρακάτω ισχύουν. " * 5  # noqa: RUF001
    assert route_of(page(text=greek, text_share=0.6))[0] == "text"


def test_thresholds_come_from_the_configuration():
    noise = (".- -,,.;; word word ::: 1# -i' " * 12).strip()
    built = page(text=noise, text_share=0.6)
    assert route_of(built)[0] == "vision"
    lenient = RoutingConfig(min_wordlike_pct=10)
    [decided] = plan_routes(document(built), lenient).pages
    assert decided.route == "text"


FREE = RoutingConfig(vision=False)
"""No vision model to send pages to: only what costs nothing."""


def test_without_a_vision_model_a_scan_goes_to_ocr():
    [decided] = plan_routes(document(page(source="none", image_share=0.95, dpi=300)), FREE).pages
    assert decided.route == "ocr"
    assert "300 dpi" in decided.reason


def test_without_a_vision_model_a_poor_scan_says_what_would_read_it_better():
    coarse = page(source="none", image_share=0.95, dpi=150)
    smeared = page(source="ocr", text="sm eared", image_share=0.95, dpi=300, ocr_confidence=0.55)
    routing = plan_routes(document(coarse, smeared), FREE)
    assert [p.route for p in routing.pages] == ["ocr", "ocr"]
    assert "150 dpi" in routing.pages[0].reason
    assert "55% confidence" in routing.pages[1].reason
    assert all("vision model would read it better" in p.reason for p in routing.pages)


def test_without_a_vision_model_a_text_layer_is_read_whatever_its_state():
    """A poor layer still kept more than OCR on the pages measured."""
    noise = (".- -,,.;; ::: 1# -i' .:|r ' .:.' .::.: " * 12).strip()
    merged = TableInfo(rows=4, cols=3, merged_cells=2, header_depth=1)
    routing = plan_routes(
        document(page(1, text=noise, text_share=0.6), page(2, text=PROSE, tables=[merged])), FREE
    )
    assert [p.route for p in routing.pages] == ["text", "text"]
    assert routing.counts["vision"] == 0


def test_a_document_reports_its_counts_and_the_route_it_needs():
    routing = plan_routes(
        document(
            page(1, text=PROSE, text_share=0.6),
            page(2, source="none", image_share=0.95, dpi=300),
            page(3, source="none", image_share=0.95, dpi=120),
        )
    )
    assert [p.route for p in routing.pages] == ["text", "vision", "vision"]
    assert routing.counts == {"text": 1, "ocr": 0, "vision": 2}
    assert routing.route == "vision"
    assert routing.pages[0].characters == len(PROSE)


@pytest.mark.parametrize("characters", [0, 10, 39])
def test_a_page_with_almost_no_text_is_not_treated_as_readable(characters):
    assert route_of(page(text="x" * characters, text_share=0.4))[0] == "vision"
