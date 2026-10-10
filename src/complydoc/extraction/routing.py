"""Which extraction path each page needs: its text layer, OCR, or a vision model.

    plan = plan_routes(document, config.readiness.routing)
    plan.counts  # {"text": 8, "ocr": 0, "vision": 3}

Sending every page to a vision model reads anything and costs the most; reading
the text layer costs nothing and returns nothing for a scan. Most folders are a
mix, and the mix is decided page by page.

With a vision model available:

| Route | When |
| --- | --- |
| `text` | A usable text layer, and nothing on the page that plain text loses |
| `vision` | No usable text layer, or plain text would lose the page |

A page with a text layer takes the vision route when the layer is not text (a font
with no usable mapping to characters, or an embedded OCR layer that read noise),
when it carries a table with merged or stacked header cells, or when it is mostly
picture with a caption for a text layer. A page with no text layer always does:
on two public benchmarks OCR kept far less of such pages than a vision model.

Without one (`vision: false`), routing uses only what costs nothing:

| Route | When |
| --- | --- |
| `text` | A text layer, whatever its state: it kept more than OCR even when poor |
| `ocr` | No usable text layer |

Each page carries the reason for its route, so a plan can be argued with. The
thresholds are the ones in `readiness.yaml`, under `routing`.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from complydoc.config.schema import RoutingConfig
from complydoc.ingest.base import Document, Page
from complydoc.utils.geometry import coverage_fraction

__all__ = ["ROUTES", "DocumentRouting", "PageRoute", "plan_routes"]

ROUTES = ("text", "ocr", "vision")
"""Cheapest first."""

_EDGE_PUNCTUATION = ".,;:!?()[]\"'"
_NUMBER = re.compile(r"[\d][\d.,:/%\-]*")


@dataclass(frozen=True, slots=True)
class PageRoute:
    number: int
    route: str
    """One of `ROUTES`."""
    reason: str
    """Why this page takes this route."""
    characters: int
    """Characters of text on the page, for apportioning the text-path cost."""


@dataclass(frozen=True, slots=True)
class DocumentRouting:
    pages: list[PageRoute] = field(default_factory=list)

    @property
    def counts(self) -> dict[str, int]:
        return {route: sum(1 for p in self.pages if p.route == route) for route in ROUTES}

    @property
    def route(self) -> str | None:
        """The most expensive route any page needs, which the document as a whole needs."""
        for route in reversed(ROUTES):
            if any(page.route == route for page in self.pages):
                return route
        return None


def _image_share(page: Page) -> float:
    if page.area_pt <= 0:
        return 0.0
    return coverage_fraction([b.bbox for b in page.image_blocks], page.width_pt, page.height_pt)


def _text_share(page: Page) -> float:
    if page.area_pt <= 0 or not page.text_blocks:
        return 0.0
    return coverage_fraction([b.bbox for b in page.text_blocks], page.width_pt, page.height_pt)


def _awkward_table(page: Page) -> bool:
    """A table whose shape is the information: merged cells, or stacked headers."""
    return any(table.merged_cells > 0 or table.header_depth > 1 for table in page.tables)


def _control_share(text: str) -> float:
    """Share of characters that are control codes, replacement marks or private-use glyphs.

    A text layer whose font has no usable mapping to Unicode comes out as these.
    """
    odd = sum(
        (unicodedata.category(c) in ("Cc", "Co", "Cn") and c not in "\r\n\t") or c == "\ufffd"
        for c in text
    )
    return odd / max(1, len(text))


def _sensible_share(text: str) -> float:
    """Share of tokens that are a word in any script, or a number.

    A word is two or more characters of which at least four in five are letters or the
    marks that attach to them, which covers scripts written without spaces and scripts that
    stack marks on letters. A number is digits with the separators numbers are written
    with. What is left is noise: stray punctuation, symbols, letters mapped to the wrong
    glyphs. Counting only alphabetic words called pages of figures, and whole scripts, not
    text.
    """

    def sensible(token: str) -> bool:
        token = token.strip(_EDGE_PUNCTUATION)
        if _NUMBER.fullmatch(token):
            return True
        lettered = sum(unicodedata.category(c)[0] in "LM" for c in token)
        return len(token) >= 2 and lettered / len(token) >= 0.8

    tokens = text.split()
    return sum(sensible(token) for token in tokens) / max(1, len(tokens))


def _not_text(page: Page, settings: RoutingConfig) -> str | None:
    """Why this page's text layer is not text, or None when it reads as text."""
    control = _control_share(page.text) * 100
    if control > settings.max_control_char_pct:
        return (
            f"{control:.0f}% of the text layer is control or unmapped characters, "
            "so its font does not map to text"
        )
    sensible = _sensible_share(page.text) * 100
    if sensible < settings.min_wordlike_pct:
        return (
            f"only {sensible:.0f}% of the text layer's tokens are words or numbers, "
            "so it is not text"
        )
    return None


def _page_route(page: Page, settings: RoutingConfig) -> tuple[str, str]:
    readable = page.text_source in ("native", "loader") and len(page.text.strip()) >= (
        settings.min_characters
    )
    image_share = _image_share(page)
    mostly_picture = image_share * 100 >= settings.picture_share_pct
    text_share = _text_share(page)

    if readable and not settings.vision:
        return "text", f"a text layer covering {text_share * 100:.0f}% of the page"

    if readable:
        broken = _not_text(page, settings)
        if broken is not None:
            return "vision", broken
        if settings.vision_for_complex_tables and _awkward_table(page):
            return "vision", "a table with merged or stacked header cells, which plain text loses"
        if mostly_picture and text_share * 100 < settings.min_text_coverage_pct:
            return (
                "vision",
                f"mostly picture ({image_share * 100:.0f}% of the page) with "
                f"{text_share * 100:.0f}% text, so the text layer is a caption",
            )
        return "text", f"a text layer covering {text_share * 100:.0f}% of the page"

    dpi = page.estimated_dpi() if mostly_picture else None
    scan = f"a scan at {dpi:.0f} dpi" if dpi is not None else "a scan" if mostly_picture else None
    if settings.vision:
        if scan is not None:
            return "vision", f"{scan} with no text layer"
        return "vision", "no usable text layer"

    if page.ocr_confidence is not None and page.ocr_confidence * 100 < settings.min_ocr_confidence:
        return (
            "ocr",
            f"no usable text layer; OCR read this page with "
            f"{page.ocr_confidence * 100:.0f}% confidence, below {settings.min_ocr_confidence:g}%, "
            "and a vision model would read it better",
        )
    if dpi is not None and dpi < settings.min_ocr_dpi:
        return (
            "ocr",
            f"{scan}, below the {settings.min_ocr_dpi:g} OCR needs, "
            "and a vision model would read it better",
        )
    if scan is not None:
        return "ocr", f"{scan} with no text layer"
    return "ocr", "no usable text layer, so the page has to be recognised"


def plan_routes(document: Document, settings: RoutingConfig | None = None) -> DocumentRouting:
    """The route each page of `document` needs, with the reason for each."""
    settings = settings or RoutingConfig()
    return DocumentRouting(
        pages=[
            PageRoute(
                number=page.number,
                route=route,
                reason=reason,
                characters=len(page.text),
            )
            for page in document.pages
            for route, reason in [_page_route(page, settings)]
        ]
    )
