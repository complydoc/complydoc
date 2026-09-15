"""Self-contained HTML output.

Everything — stylesheet included — is inlined, so the file can be opened from a
USB stick or forwarded by email and still render exactly as generated. There are
no external assets and no scripts to fetch.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from markupsafe import escape

from complydoc.config.schema import Config
from complydoc.hidden.check import severity_of
from complydoc.report.assets import FAVICON_URI, LOGO_SVG, template_environment
from complydoc.report.charts import (
    BAND_SERIES,
    SERIES,
    build_comparison,
    grouped_bars_svg,
    headline_comparison,
    readiness_donut_svg,
)
from complydoc.report.diffing import ReadingDiff, compare_readings
from complydoc.report.models import AuditReport, DocumentReport
from complydoc.report.overall import overall_readiness
from complydoc.report.preview import Box, PagePreview
from complydoc.report.quickwins import quick_wins
from complydoc.sensitive.base import EVIDENCE_ORDER, SEVERITY_WEIGHT
from complydoc.utils.text import count, duration

__all__ = [
    "PageRow",
    "page_preview_svg",
    "page_rows",
    "render_html",
    "sensitive_rows",
    "write_html",
]


def severity_rank(severity: str) -> int:
    """Sort weight. Alphabetical would file high between low and medium.

    An unknown severity sorts last.
    """
    return SEVERITY_WEIGHT.get(severity, 0)


def evidence_rank(evidence: str) -> int:
    """Sort weight, strongest first. Alphabetical would put a model guess top."""
    return len(EVIDENCE_ORDER) - EVIDENCE_ORDER.index(evidence) if evidence in EVIDENCE_ORDER else 0


def content_rows(report: AuditReport) -> list[tuple[DocumentReport, Any]]:
    """Every hidden or instruction-like passage in the folder, most serious first."""
    rows = [(d, f) for d in report.documents for f in d.content_findings]
    rows.sort(
        key=lambda row: (-severity_rank(row[1].severity), row[0].relative_path, row[1].page or 0)
    )
    return rows


def sensitive_rows(report: AuditReport) -> list[tuple[DocumentReport, Any]]:
    """Every match in the folder, most serious first.

    On a security page the question is almost always what the worst of it is,
    not what came first in the folder, so the table arrives ordered by severity
    and ties break by evidence — a confirmed card number above a guessed name
    of the same severity — and then by document and position.
    """
    rows = [
        (document, match)
        for document in report.documents
        if document.sensitive
        for match in document.sensitive.matches
    ]
    rows.sort(
        key=lambda row: (
            -severity_rank(row[1].severity),
            -evidence_rank(row[1].evidence),
            row[0].relative_path,
            row[1].page,
            row[1].line,
        )
    )
    return rows


_PREVIEW_WIDTH = 240


@dataclass(frozen=True, slots=True)
class PageRow:
    """One page of a document, as the viewer needs it: the page and its content.

    Previews and extracted text are collected separately and either can be
    absent, so they are joined by page number here.
    """

    number: int
    preview: PagePreview | None = None
    image_data_uri: str | None = None
    image_width_px: int = 0
    image_height_px: int = 0
    text: str = ""
    ocr_text: str = ""
    source: str = ""
    characters: int = 0
    truncated: bool = False
    readings: dict[str, str] = field(default_factory=dict)
    """What each reader compared on this run made of the page, by name."""

    diffs: list[ReadingDiff] = field(default_factory=list)
    """Every other reader's version of this page, against the kept one.

    Worked out once when the row is built. The template reads it twice — once
    to mark the page as one where the readers parted company, once to render
    the marks — and the comparison is quadratic in the length of the page.
    """

    @property
    def readers_differ(self) -> bool:
        return any(d.differs for d in self.diffs)

    @property
    def flags(self) -> list[tuple[str, str]]:
        return self.preview.flags if self.preview is not None else []


def page_rows(document: DocumentReport) -> list[PageRow]:
    """Every page of one document, in order, whether or not it could be read."""
    previews = {p.number: p for p in document.previews}
    texts = {t.number: t for t in document.extracted_text}

    rows: list[PageRow] = []
    for number in sorted(set(previews) | set(texts)):
        preview = previews.get(number)
        text = texts.get(number)
        rows.append(
            PageRow(
                number=number,
                preview=preview,
                image_data_uri=preview.image_data_uri if preview is not None else None,
                image_width_px=preview.image_width_px if preview is not None else 0,
                image_height_px=preview.image_height_px if preview is not None else 0,
                text=text.text if text else "",
                ocr_text=text.ocr_text if text else "",
                source=text.source if text else "",
                characters=text.characters if text else 0,
                truncated=bool(text and text.truncated),
                readings=dict(text.readings) if text else {},
                diffs=_diffs_for(text),
            )
        )
    return rows


def _diffs_for(text: object) -> list[ReadingDiff]:
    """The other readers' versions of one page, or nothing to compare."""
    readings = getattr(text, "readings", None) or {}
    kept = (getattr(text, "text", "") or "") or (getattr(text, "ocr_text", "") or "")
    others = {name: reading for name, reading in readings.items() if reading != kept}
    if not kept or not others:
        return []
    return compare_readings(kept, others)


def _money(value: float | None, currency: str = "USD") -> str:
    if value is None:
        return "—"
    symbol = {"USD": "$", "GBP": "£", "EUR": "€"}.get(currency.upper(), f"{currency} ")
    if value and abs(value) < 0.01:
        return f"{symbol}{value:.5f}"
    return f"{symbol}{value:,.2f}"


def _drivers(readiness: object, rating: str, limit: int) -> list[object]:
    """The signals with the most weight behind a rating, heaviest first."""
    signals = getattr(readiness, "signals", None) or []
    matching = [s for s in signals if getattr(s, "rating", None) == rating]
    matching.sort(key=lambda s: (s.weight, s.id), reverse=True)
    return matching[:limit]


def page_preview_svg(preview: PagePreview, width: int = _PREVIEW_WIDTH) -> str:
    """One page drawn as geometry: words, images, sensitive marks. No content.

    Monochrome and unlabelled; the numbers are in the table underneath.
    """
    height = max(24, round(width * preview.aspect))
    parts: list[str] = [
        f'<svg class="pv" viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
        f'role="img" aria-label="Page {preview.number} layout: '
        f"{preview.text_coverage_pct}% text, {preview.image_coverage_pct}% image, "
        f'{count(preview.sensitive_count, "sensitive item")}">'
    ]

    def rect(box: Box, **attrs: object) -> str:
        x, y = box.x * width, box.y * height
        # A floor of 0.6, so a hairline rule or a one-character mark is still drawn.
        w, h = max(0.6, box.w * width), max(0.6, box.h * height)
        extra = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in attrs.items())
        return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" {extra}/>'

    parts.append(
        f'<rect x="0" y="0" width="{width}" height="{height}" '
        f'fill="var(--pv-page)" stroke="var(--pv-edge)"/>'
    )
    for box in preview.gutters:
        parts.append(rect(box, fill="var(--pv-gutter)"))
    for box in preview.image_blocks:
        parts.append(rect(box, fill="var(--pv-image)"))
    for box in preview.text_blocks:
        parts.append(rect(box, fill="var(--pv-text)"))
    for box in preview.sensitive:
        stroke = "var(--poor)" if box.label == "high" else "var(--fair)"
        mark = rect(box, fill="none", stroke=stroke, stroke_width="1.2")
        if box.title:
            # `aria-label` instead of <title>, which would show a second, browser
            # tooltip next to the report's own.
            label = " ".join(box.title.split())
            value = f' data-value="{escape(box.value)}"' if box.value else ""
            parts.append(
                f'<g class="pv-mark" aria-label="{escape(label)}" '
                f'data-tip="{escape(box.title)}"{value}>{mark}</g>'
            )
        else:
            parts.append(mark)

    if preview.unreadable:
        parts.append(
            f'<line x1="0" y1="0" x2="{width}" y2="{height}" stroke="var(--pv-edge)"/>'
            f'<line x1="{width}" y1="0" x2="0" y2="{height}" stroke="var(--pv-edge)"/>'
        )
    parts.append("</svg>")
    return "".join(parts)


def render_html(report: AuditReport, config: Config) -> str:
    environment = template_environment()

    currency = report.aggregate.currency if report.aggregate else "USD"

    def category_meta(category_id: str) -> dict[str, Any]:
        entry = config.sensitive.categories.get(category_id)
        if entry is None:
            return {"label": category_id, "severity": "medium", "region": "?", "note": ""}
        return {
            "label": entry.label,
            "severity": entry.severity,
            "region": entry.region,
            "note": (entry.gdpr_note or "").strip(),
        }

    def severity_class(severity: str) -> str:
        return {"high": "r-poor", "medium": "r-fair", "low": "r-na"}.get(severity, "r-na")

    def severity_badge(severity: str) -> str:
        return f'<span class="r {severity_class(severity)}">{escape(severity)}</span>'

    def score_band(value: float) -> str:
        """Match the score bands the readiness module labels with."""
        if value >= 75:
            return "good"
        if value >= 50:
            return "fair"
        return "poor"

    def score_class(value: float) -> str:
        if value >= 75:
            return "r-good"
        if value >= 50:
            return "r-fair"
        return "r-poor"

    # Normally computed with the report, so the JSON carries them too.
    overall = report.overall or overall_readiness(report, config.readiness.overall)
    wins = report.quick_wins or quick_wins(report)
    comparisons = build_comparison(report)
    headline = headline_comparison(comparisons, config.pricing.compare.headline_model)
    run = report.run
    options = [f"complydoc {' '.join(run.components_run)}"]
    if run.ocr_requested:
        options.append("--ocr" if run.ocr_available else "--ocr (unavailable)")
    else:
        options.append("--no-ocr")
    for flag, used in (
        ("--ocr-compare", run.ocr_compare_used),
        ("--page-images", run.page_images_used),
        ("--extracted-text", run.extracted_text_used),
        ("--reveal", run.reveal_used),
        ("--password", run.password_used),
    ):
        if used:
            options.append(flag)
    if run.monthly_volume:
        options.append(f"--monthly-volume {run.monthly_volume:,}")
    if run.sampled_from is not None:
        options.append(f"--sample (of {run.sampled_from:,} found)")
    if run.jobs > 1:
        options.append(f"--jobs {run.jobs}")
    template = environment.get_template("report.html.j2")
    return template.render(
        comparisons=comparisons,
        headline=headline,
        overall=overall,
        quick_wins=wins,
        readiness_donut=readiness_donut_svg(overall.bands, overall.score, overall.label),
        run_options=" ".join(options),
        series=SERIES,
        folder_chart=grouped_bars_svg(
            comparisons, "folder_usd", "Cost for this folder, by model and architecture"
        ),
        per_1000_chart=grouped_bars_svg(
            comparisons, "per_1000_usd", "Cost per 1,000 documents, by model and architecture"
        ),
        annual_chart=(
            grouped_bars_svg(comparisons, "annual_usd", "Annual cost, by model and architecture")
            if report.run.monthly_volume
            else ""
        ),
        report=report,
        page_preview_svg=page_preview_svg,
        logo_svg=LOGO_SVG,
        favicon_uri=FAVICON_URI,
        page_rows=page_rows,
        sensitive_rows=sensitive_rows,
        money=lambda v: _money(v, currency),
        category_meta=category_meta,
        duration=duration,
        count=count,
        band_series=BAND_SERIES,
        severity_class=severity_class,
        severity_badge=severity_badge,
        content_rows=content_rows,
        content_severity=severity_of,
        severity_rank=severity_rank,
        evidence_rank=evidence_rank,
        hard_drivers=lambda d, n=3: _drivers(d, "poor", n),
        easy_drivers=lambda d, n=3: _drivers(d, "good", n),
        score_band=score_band,
        score_class=score_class,
    )


def write_html(report: AuditReport, config: Config, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_html(report, config), encoding="utf-8")
    return path
