"""Which extraction path each page needs: its text layer, OCR, or a vision model.

    plan = plan_routes(document, config.readiness.routing)
    plan.counts  # {"text": 8, "ocr": 2, "vision": 1}

Sending every page to a vision model reads anything and costs the most; reading
the text layer costs the least and returns nothing for a scan. Most folders are a
mix, and the mix is decided page by page:

| Route | When |
| --- | --- |
| `text` | A usable text layer, and nothing on the page that plain text loses |
| `ocr` | No usable text layer, and a scan OCR can read |
| `vision` | Plain text would lose the page |

A page takes the vision route when it carries a table with merged or stacked
header cells, when it is mostly picture with a caption for a text layer, when it
is a scan too coarse for OCR, or when OCR read it poorly.

Each page carries the reason for its route, so a plan can be argued with. The
thresholds are the ones in `readiness.yaml`, under `routing`.

Routes are decided while the document is open, because per-page tables, scan
resolution and OCR confidence are not carried in the report.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from complydoc.config.schema import RoutingConfig
from complydoc.ingest.base import Document, Page
from complydoc.utils.geometry import coverage_fraction

__all__ = ["ROUTES", "DocumentRouting", "PageRoute", "plan_routes"]

ROUTES = ("text", "ocr", "vision")
"""Cheapest first."""


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


def _page_route(page: Page, settings: RoutingConfig) -> tuple[str, str]:
    readable = page.text_source in ("native", "loader") and len(page.text.strip()) >= (
        settings.min_characters
    )
    image_share = _image_share(page)
    mostly_picture = image_share * 100 >= settings.picture_share_pct

    if readable:
        if settings.vision_for_complex_tables and _awkward_table(page):
            return "vision", "a table with merged or stacked header cells, which plain text loses"
        text_share = _text_share(page)
        if mostly_picture and text_share * 100 < settings.min_text_coverage_pct:
            return (
                "vision",
                f"mostly picture ({image_share * 100:.0f}% of the page) with "
                f"{text_share * 100:.0f}% text, so the text layer is a caption",
            )
        return "text", f"a text layer covering {text_share * 100:.0f}% of the page"

    if page.ocr_confidence is not None and page.ocr_confidence * 100 < settings.min_ocr_confidence:
        return (
            "vision",
            f"OCR read this page with {page.ocr_confidence * 100:.0f}% confidence, "
            f"below {settings.min_ocr_confidence:g}%",
        )

    dpi = page.estimated_dpi() if mostly_picture else None
    if dpi is not None and dpi < settings.min_ocr_dpi:
        return "vision", f"a scan at {dpi:.0f} dpi, below the {settings.min_ocr_dpi:g} OCR needs"
    if mostly_picture:
        where = f" at {dpi:.0f} dpi" if dpi is not None else ""
        return "ocr", f"a scan{where} with no text layer"
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
