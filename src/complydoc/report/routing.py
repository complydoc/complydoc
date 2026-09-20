"""What the routed mix costs, beside sending everything one way.

Each page already carries the route it needs (`complydoc.extraction.routing`).
This prices that mix for the model the report quotes, next to the three
architectures the cost comparison already shows, so the four numbers are
comparable:

- `routed`: each page by the route it needs
- `text_layer`: only documents that already carry a text layer
- `text_ocr`: every document, scans recognised locally first
- `vision`: every page sent as an image

Pages routed to the text layer or to OCR are priced on the document's text
tokens, shared between its pages by how many characters each holds; the tokens
of a page are not counted separately during a run. Pages routed to vision are
priced by rendering that page at the report's resolution, the same way the
vision architecture is priced.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from complydoc.config.schema import PricingConfig
from complydoc.cost.estimator import DocumentCostEstimate, ModelCostEstimate
from complydoc.cost.vision import vision_tokens
from complydoc.extraction.routing import ROUTES
from complydoc.report.charts import build_comparison, headline_comparison
from complydoc.report.models import AuditReport
from complydoc.utils.files import write_text
from complydoc.utils.text import count

__all__ = ["RoutingSummary", "routing_manifest", "summarise_routes", "write_routing_json"]


@dataclass(slots=True)
class RoutingSummary:
    """How many pages take each route, and what that mix costs."""

    pages: dict[str, int] = field(default_factory=dict)
    """Pages per route."""
    documents: dict[str, int] = field(default_factory=dict)
    """Documents per route, counted by the most expensive route any of their pages needs."""
    documents_routed: int = 0
    documents_without_pages: int = 0
    """Documents that opened but hold no pages, such as an encrypted PDF. They take
    no route because there is nothing to route."""
    model_id: str | None = None
    model_name: str | None = None
    resolution: str | None = None
    routed_usd: float | None = None
    text_layer_usd: float | None = None
    text_ocr_usd: float | None = None
    vision_usd: float | None = None
    basis: str = ""

    @property
    def saved_against_vision_usd(self) -> float | None:
        if self.routed_usd is None or self.vision_usd is None:
            return None
        return round(self.vision_usd - self.routed_usd, 6)

    @property
    def vision_pages_pct(self) -> float | None:
        total = sum(self.pages.values())
        return round(self.pages.get("vision", 0) / total * 100, 1) if total else None


def _headline_model(estimate: DocumentCostEstimate, wanted: str) -> ModelCostEstimate | None:
    """The same model the rest of the report quotes, or the last compared."""
    if not estimate.models:
        return None
    for model in estimate.models:
        if model.model_id.rsplit("/", 1)[-1] == wanted:
            return model
    return estimate.models[-1]


def _document_routed_usd(
    report_document_routing: object,
    estimate: DocumentCostEstimate,
    pricing: PricingConfig,
    resolution: str,
    wanted: str,
) -> float | None:
    """What this document costs when each page takes the route it needs."""
    from complydoc.extraction.routing import DocumentRouting

    if not isinstance(report_document_routing, DocumentRouting):
        return None
    model = _headline_model(estimate, wanted)
    price = model.input_per_mtok_usd if model else None
    if model is None or not price:
        return None

    facts = {fact.number: fact for fact in estimate.pages}
    formula = pricing.vision_formulas.get(model.vision_formula or "")
    characters = sum(page.characters for page in report_document_routing.pages)

    total = 0.0
    for page in report_document_routing.pages:
        if page.route == "vision":
            fact = facts.get(page.number)
            if fact is None or formula is None or resolution not in fact.rendered:
                # The page cannot be priced as an image, so neither can the mix.
                return None
            total += vision_tokens(fact.rendered[resolution], formula) / 1_000_000 * price
        else:
            share = page.characters / characters if characters else 0.0
            total += model.text_tokens * share / 1_000_000 * price
    return total


def summarise_routes(report: AuditReport, pricing: PricingConfig) -> RoutingSummary | None:
    """Route counts for the folder, and the cost of that mix against the alternatives."""
    routed = [d for d in report.documents if d.routing is not None]
    if not routed:
        return None

    summary = RoutingSummary(
        pages={
            route: sum(d.routing.counts[route] for d in routed if d.routing) for route in ROUTES
        },
        documents={
            route: sum(1 for d in routed if d.routing and d.routing.route == route)
            for route in ROUTES
        },
        documents_routed=len(routed),
        documents_without_pages=sum(1 for d in routed if d.routing and not d.routing.pages),
    )

    if report.cost is None or not report.cost.documents:
        summary.basis = (
            "Routes come from what each page carries. No cost component ran, so the mix "
            "is not priced."
        )
        return summary

    wanted = pricing.compare.headline_model
    resolution = report.cost.headline_resolution
    comparison = headline_comparison(build_comparison(report), wanted)
    if comparison is not None:
        summary.model_id = comparison.model_id
        summary.model_name = comparison.display_name
        for key, attribute in (
            ("text_layer", "text_layer_usd"),
            ("text_ocr", "text_ocr_usd"),
            ("vision", "vision_usd"),
        ):
            architecture = comparison.by_key(key)
            setattr(summary, attribute, architecture.folder_usd if architecture else None)
    summary.resolution = resolution

    by_path = {str(estimate.path): estimate for estimate in report.cost.documents}
    total = 0.0
    priced = 0
    for document in routed:
        estimate = by_path.get(str(document.path))
        if estimate is None:
            continue
        usd = _document_routed_usd(document.routing, estimate, pricing, resolution, wanted)
        if usd is None:
            continue
        total += usd
        priced += 1
    summary.routed_usd = round(total, 6) if priced else None

    covered = (
        "every document"
        if priced == summary.documents_routed
        else f"{priced} of {summary.documents_routed} documents"
    )
    empty = (
        f" {count(summary.documents_without_pages, 'document')} hold no pages and take no route."
        if summary.documents_without_pages
        else ""
    )
    summary.basis = (
        f"Each page priced by the route it needs, for {summary.model_name or 'the headline model'} "
        f"at {resolution} resolution, covering {covered}. Text and OCR pages are priced on the "
        f"document's text tokens shared out by characters per page; vision pages are priced as "
        f"rendered images.{empty}"
    )
    return summary


def routing_manifest(report: AuditReport) -> dict[str, Any]:
    """The plan as a job can read it: one entry per document, one row per page."""
    summary = report.routing
    return {
        "tool_version": report.run.tool_version,
        "schema_version": report.run.schema_version,
        "generated_at": report.run.finished_at,
        "target": report.run.target,
        "model": summary.model_name if summary else None,
        "resolution": summary.resolution if summary else None,
        "counts": {
            "pages": dict(summary.pages) if summary else {},
            "documents": dict(summary.documents) if summary else {},
            "documents_without_pages": summary.documents_without_pages if summary else 0,
        },
        "cost_usd": {
            "routed": summary.routed_usd if summary else None,
            "text_layer": summary.text_layer_usd if summary else None,
            "text_ocr": summary.text_ocr_usd if summary else None,
            "vision": summary.vision_usd if summary else None,
        },
        "basis": summary.basis if summary else "",
        "documents": [
            {
                "document": document.relative_path,
                "route": document.routing.route,
                "pages": [
                    {
                        "page": page.number,
                        "route": page.route,
                        "reason": page.reason,
                        "characters": page.characters,
                    }
                    for page in document.routing.pages
                ],
            }
            for document in report.documents
            if document.routing is not None
        ],
        "skipped": [
            {"document": record.path.name, "reason": record.reason} for record in report.skipped
        ],
    }


def write_routing_json(report: AuditReport, path: Path) -> Path:
    content = json.dumps(routing_manifest(report), indent=2, sort_keys=True, ensure_ascii=False)
    return write_text(path, content + "\n")
