"""Read pages again with a vision model, and say where it disagrees with the kept reading.

    verification = verify_document(document, routing, model, scope="all", ...)
    verification.count("disagrees")  # 3

The question it answers is whether a reading holds everything on the page. A
second, independent reader — one that looks at the page as pixels, the way a
person does — is compared with the reading the report was built from, page by
page. Where the vision model read words the kept reading does not have, the
page disagrees, and those words are what the report shows.

Which pages are read again is the caller's decision:

| Scope | Pages |
| --- | --- |
| `flagged` | Sent to vision by routing, with no usable reading, or disputed by two readers |
| `all` | Every page, whatever the measurements said |

A page with no usable reading at all takes the vision reading as its text
(`filled`): there is nothing to compare, and the vision model is the only
reader that got anything. Every other page keeps its reading; vision only
checks it.

Pages go to the model through `offline.permitted()`, so the connections are
recorded and the guard is back in place the moment the calls return.
"""

from __future__ import annotations

import io
import re
import time
from collections import Counter
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from complydoc import offline
from complydoc.config.schema import ModelPricing, PricingConfig
from complydoc.cost.vision import RenderedSize, vision_tokens
from complydoc.extraction.routing import DocumentRouting
from complydoc.ingest.base import Document, Page
from complydoc.report.models import DocumentVerification, PageVerification, ReadingCost
from complydoc.utils.text import MAX_WORDS, reading_similarity
from complydoc.verification.vision import (
    VisionModel,
    VisionPage,
    VisionReading,
    model_name,
)

__all__ = ["Comparison", "compare", "reading_cost", "render_page", "verify_document"]

_DISAGREEING_READERS = 0.95
"""Below this similarity, two extractors read a page differently. The same line
`DocumentReport.disagreement` draws."""

_IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif", ".webp"})

_CONCURRENT_CALLS = 4
"""Pages sent at once. A provider's rate limit is the caller's, so this stays low."""

_MISSING_CHARS = 240

_WORD = re.compile(r"\w+", re.UNICODE)


@dataclass(frozen=True, slots=True)
class _Rendered:
    image: bytes
    size: RenderedSize


def render_page(path: Path, number: int, long_edge_px: int, password: str = "") -> _Rendered | None:
    """Page `number` of the file at `path` as a PNG, its long edge `long_edge_px` pixels.

    None for a file that is not a PDF or an image on disk: a Word document or a
    loader's output has no page to draw.
    """
    if not path.is_file():
        return None
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _render_pdf(path, number, long_edge_px, password)
    if suffix in _IMAGE_SUFFIXES:
        return _render_image(path, number, long_edge_px)
    return None


def _png(image: object) -> _Rendered:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")  # type: ignore[attr-defined]
    width, height = image.size  # type: ignore[attr-defined]
    return _Rendered(buffer.getvalue(), RenderedSize(width, height))


def _render_pdf(path: Path, number: int, long_edge_px: int, password: str) -> _Rendered | None:
    import contextlib

    import pypdfium2 as pdfium

    try:
        pdf = pdfium.PdfDocument(str(path), password=password or None)
    except (pdfium.PdfiumError, OSError):
        return None
    try:
        if not 1 <= number <= len(pdf):
            return None
        page = pdf[number - 1]
        width_pt, height_pt = page.get_size()
        long_edge = max(width_pt, height_pt)
        if long_edge <= 0:
            return None
        bitmap = page.render(scale=long_edge_px / long_edge)
        return _png(bitmap.to_pil().convert("RGB"))
    # pdfium raises its own errors on a damaged page; that page is not drawn.
    except Exception:
        return None
    finally:
        with contextlib.suppress(Exception):
            pdf.close()


def _render_image(path: Path, number: int, long_edge_px: int) -> _Rendered | None:
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(path) as opened:
            opened.seek(number - 1)
            image = opened.convert("RGB")
    except (UnidentifiedImageError, OSError, EOFError):
        return None
    image.thumbnail((long_edge_px, long_edge_px))
    return _png(image)


def _priced_models(pricing: PricingConfig) -> dict[str, ModelPricing]:
    from complydoc.cost.price_table import imported_models

    table: dict[str, ModelPricing] = {}
    # The curated entries win over the catalogue's for the same id.
    for model in (*imported_models(), *pricing.models):
        if model.is_priced:
            table[model.id] = model
            table.setdefault(model.id.rpartition("/")[2], model)
    return table


def reading_cost(
    reading: VisionReading,
    name: str,
    pricing: PricingConfig,
    size: RenderedSize | None,
    priced: dict[str, ModelPricing] | None = None,
) -> ReadingCost:
    """What one vision reading cost, as exactly as the reading lets it be said.

    A figure the caller returned is taken as given. The provider's token counts
    are priced from `pricing.yaml` and the catalogue behind it, and are `actual`.
    Without either, the page's size under the model's image formula gives an
    `estimated` input cost. A model complydoc has no price for is `unpriced`.
    """
    model_id = reading.model or name
    tokens_in, tokens_out = reading.input_tokens, reading.output_tokens
    if reading.usd is not None:
        return ReadingCost(round(reading.usd, 6), "actual", model_id, tokens_in, tokens_out)

    table = priced if priced is not None else _priced_models(pricing)
    model = table.get(model_id) or table.get(model_id.rpartition("/")[2])
    if model is None or model.input_per_mtok_usd is None:
        return ReadingCost(None, "unpriced", model_id, tokens_in, tokens_out)

    if tokens_in is not None:
        usd = tokens_in / 1e6 * model.input_per_mtok_usd
        if tokens_out and model.output_per_mtok_usd is not None:
            usd += tokens_out / 1e6 * model.output_per_mtok_usd
        return ReadingCost(round(usd, 6), "actual", model.id, tokens_in, tokens_out)

    formula = pricing.vision_formulas.get(model.vision_formula or "")
    if formula is None or size is None:
        return ReadingCost(None, "unpriced", model.id)
    image_tokens = vision_tokens(size, formula)
    return ReadingCost(
        round(image_tokens / 1e6 * model.input_per_mtok_usd, 6), "estimated", model.id, image_tokens
    )


def _why(
    page: Page, routing: dict[int, tuple[str, str]], scope: str, min_characters: int
) -> str | None:
    """Why `page` is read again, or None when the scope leaves it alone."""
    route, reason = routing.get(page.number, ("", ""))
    if route == "vision":
        return f"routing sent it to vision: {reason}"
    if len(page.text.strip()) < min_characters:
        return "no usable reading of the page"
    disputed = [e for e in page.extractions if e.similarity < _DISAGREEING_READERS]
    if disputed:
        return f"{disputed[0].extractor} read it differently from the kept reader"
    return "every page is checked" if scope == "all" else None


def _words(text: str) -> list[str]:
    return _WORD.findall(text)


@dataclass(frozen=True, slots=True)
class Comparison:
    similarity: float
    coverage: float | None
    """None when the vision reading holds no words."""
    missing: str
    longest_missing: int
    """The longest run of consecutive vision words the kept reading lacks."""


def compare(kept: str, vision: str) -> Comparison:
    """Similarity in order, coverage of the vision reading, and what the kept one lacks.

    By word and ignoring case and punctuation, because a vision model sets a
    page out its own way: a table as pipes, a heading with a hash. What counts
    is whether the words are there.
    """
    kept_words = [w.lower() for w in _words(kept)][:MAX_WORDS]
    vision_originals = _words(vision)[:MAX_WORDS]
    vision_words = [w.lower() for w in vision_originals]
    similarity = reading_similarity(kept_words, vision_words)
    if not vision_words:
        return Comparison(similarity, None, "", 0)

    available = Counter(kept_words)
    runs: list[list[str]] = []
    found = 0
    previous_missing = False
    for original, word in zip(vision_originals, vision_words, strict=True):
        if available[word] > 0:
            available[word] -= 1
            found += 1
            previous_missing = False
            continue
        if not previous_missing:
            runs.append([])
        runs[-1].append(original)
        previous_missing = True
    # The longest runs first: a missing phrase says more than a missing word.
    ordered = sorted(runs, key=len, reverse=True)
    missing = " … ".join(" ".join(run) for run in ordered)
    if len(missing) > _MISSING_CHARS:
        missing = missing[: _MISSING_CHARS - 1].rstrip() + "…"
    return Comparison(
        similarity,
        round(found / len(vision_words), 4),
        missing,
        max((len(run) for run in runs), default=0),
    )


def _call(model: VisionModel, page: VisionPage) -> tuple[VisionReading | str, float]:
    """The model's answer for one page, or why there is none, and how long it took."""
    started = time.perf_counter()
    try:
        result = model(page)
    # The model is caller code; whatever it raises is that page's failure, not the run's.
    except Exception as exc:
        return f"{type(exc).__name__}: {exc}"[:300], time.perf_counter() - started
    elapsed = time.perf_counter() - started
    if isinstance(result, VisionReading):
        return result, elapsed
    if isinstance(result, str):
        return VisionReading(text=result), elapsed
    return f"the model returned {type(result).__name__}, not text or a VisionReading", elapsed


def _hosts(connections: Sequence[str]) -> list[str]:
    hosts: list[str] = []
    for connection in connections:
        match = re.search(r"DNS lookup of '([^']+)'", connection)
        if match and match.group(1) not in hosts:
            hosts.append(match.group(1))
    return hosts


def verify_document(
    document: Document,
    routing: DocumentRouting,
    model: VisionModel,
    *,
    pricing: PricingConfig,
    scope: str = "flagged",
    resolution: str = "medium",
    min_characters: int = 40,
    min_coverage: float = 0.9,
    missing_words: int = 4,
    password: str = "",
    mask: Callable[[str], str] = lambda text: text,
) -> DocumentVerification:
    """Read the pages `scope` selects with `model`, and compare each with the kept reading.

    Changes `document` in two ways: every vision reading is added to its page's
    `readings`, and a page with no usable reading takes the vision reading as
    its text. Both happen before the identifier scan, so a page only the vision
    model could read is still searched.

    A page disagrees when the kept reading holds less than `min_coverage` of
    the vision reading's words, or lacks `missing_words` of them in a row.

    `mask` is applied to what the report quotes from a page.
    """
    name = model_name(model)
    label = f"vision:{name}"
    routes = {p.number: (p.route, p.reason) for p in routing.pages}
    unreadable = [p.number for p in document.pages if not p.text.strip() and not p.image_blocks]

    preset = pricing.resolution_presets.get(resolution)
    long_edge = preset.long_edge_px if preset is not None else 1536

    checked: list[tuple[Page, str]] = []
    for page in document.pages:
        why = _why(page, routes, scope, min_characters)
        if why is not None:
            checked.append((page, why))

    rendered = {
        page.number: render_page(document.path, page.number, long_edge, password)
        for page, _why_checked in checked
    }
    requests = [
        VisionPage(
            document=document.path.name,
            number=page.number,
            image=image.image,
            width_px=image.size.width_px,
            height_px=image.size.height_px,
        )
        for page, _why_checked in checked
        if (image := rendered[page.number]) is not None
    ]

    answers: dict[int, tuple[VisionReading | str, float]] = {}
    connections: list[str] = []
    if requests:
        # Lifted once for the batch, not per call: the guard is process state,
        # and threads each lifting and restoring it would put it back wrongly.
        with (
            offline.permitted() as seen,
            ThreadPoolExecutor(max_workers=min(_CONCURRENT_CALLS, len(requests))) as pool,
        ):
            for request, result in zip(
                requests, pool.map(lambda r: _call(model, r), requests), strict=True
            ):
                answers[request.number] = result
        connections = seen

    priced = _priced_models(pricing)
    pages: list[PageVerification] = []
    for page, why in checked:
        image = rendered[page.number]
        if image is None:
            pages.append(PageVerification(page.number, "not_rendered", why))
            continue
        answer, took = answers[page.number]
        seconds = round(took, 3)
        if isinstance(answer, str):
            pages.append(
                PageVerification(page.number, "failed", why, error=answer, seconds=seconds)
            )
            continue

        cost = reading_cost(answer, name, pricing, image.size, priced)
        page.readings[label] = answer.text
        if len(page.text.strip()) < min_characters and answer.text.strip():
            page.text = answer.text
            page.text_source = "vision"
            pages.append(PageVerification(page.number, "filled", why, cost=cost, seconds=seconds))
            continue

        found = compare(page.text, answer.text)
        agrees = (
            found.coverage is not None
            and found.coverage >= min_coverage
            and found.longest_missing < missing_words
        )
        pages.append(
            PageVerification(
                page.number,
                "agrees" if agrees else "disagrees",
                why,
                similarity=found.similarity,
                coverage=found.coverage,
                missing="" if agrees else mask(found.missing),
                cost=cost,
                seconds=seconds,
            )
        )

    return DocumentVerification(
        model=label,
        scope=scope,
        pages_total=document.page_count,
        pages=pages,
        unreadable_pages=unreadable,
        sent_to=_hosts(connections),
    )
