"""Cost comparison across processing architectures.

Three ways to get a document in front of a model, each with a different price and,
more importantly, a different reach:

- **Text layer** — read the text the file already carries. Cheapest, but it only
  works on documents that have one.
- **Text + local OCR** — same tokens, same price, but scans are read locally first,
  so it reaches every document. The OCR itself costs nothing to the provider.
- **Vision** — send the rendered page. Reaches everything, costs the most.

The text layer is cheapest but serves only documents that have one, so reach is
reported beside every figure.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - type-checking imports only
    # The report model imports the cost estimator, so this is resolved by a type
    # checker only, which keeps the dependency one-way at runtime.
    from complydoc.report.models import AuditReport

__all__ = [
    "ARCHITECTURES",
    "ArchitectureCost",
    "ModelComparison",
    "build_comparison",
    "headline_comparison",
]

ARCHITECTURES = (
    ("text_layer", "Text layer"),
    ("text_ocr", "Text + local OCR"),
    ("vision", "Vision"),
)
"""Each way to get a document in front of a model, by key, cheapest reach first."""

_NOTES = {
    "text_layer": "Only documents that already carry a text layer.",
    "text_ocr": "Every document. Scans are read locally first, which costs nothing to send.",
    "vision": "Every document, sent as page images.",
}


@dataclass(frozen=True, slots=True)
class ArchitectureCost:
    key: str
    label: str
    folder_usd: float | None
    per_document_usd: float | None
    per_1000_usd: float | None
    annual_usd: float | None
    documents_served: int
    documents_total: int
    note: str


@dataclass(slots=True)
class ModelComparison:
    model_id: str
    display_name: str
    provider: str = ""
    architectures: list[ArchitectureCost] = field(default_factory=list)
    batch_per_1000_usd: float | None = None
    """The same text tokens through the provider's batch endpoint, per 1,000
    documents. None where the provider publishes no batch price; it is never
    inferred from the customary discount."""
    price_source: str = "verified"
    input_per_mtok_usd: float | None = None
    """The input price, so one page can be priced on this model as well as the folder."""
    supports_vision: bool = False
    vision_formula: str | None = None
    """The image formula `pages[].image_tokens` is keyed by."""
    tokenizer: str = ""
    """The count `pages[].tokens` is keyed by."""

    def by_key(self, key: str) -> ArchitectureCost | None:
        return next((a for a in self.architectures if a.key == key), None)


def headline_comparison(comparisons: list[ModelComparison], wanted: str) -> ModelComparison | None:
    """The model the summary quotes when it has to name one number.

    Falls back to the cheapest priced model in the comparison when the chosen
    one is not among them — a catalogue refresh or a narrowed `--model` can
    leave it out — so the front page always has a figure and always says which
    model produced it.
    """
    if not comparisons:
        return None
    for comparison in comparisons:
        if comparison.model_id.rsplit("/", 1)[-1] == wanted:
            return comparison
    return comparisons[-1]


def build_comparison(report: AuditReport) -> list[ModelComparison]:
    """Folder cost per model under each architecture."""
    if report.cost is None or not report.cost.documents:
        return []

    resolution = report.cost.headline_resolution
    volume = report.run.monthly_volume
    total_documents = len(report.cost.documents)
    model_ids = [m.model_id for m in report.cost.documents[0].models]

    comparisons: list[ModelComparison] = []
    for index, model_id in enumerate(model_ids):
        display = report.cost.documents[0].models[index].display_name
        buckets: dict[str, tuple[float, int]] = {k: (0.0, 0) for k, _ in ARCHITECTURES}

        batch_total, batch_served = 0.0, 0
        for estimate in report.cost.documents:
            model = estimate.models[index]
            text = model.text_path_input_usd
            vision = model.vision_input_usd_by_resolution.get(resolution)
            if model.batch_text_path_input_usd is not None:
                batch_total += model.batch_text_path_input_usd
                batch_served += 1

            if text is not None:
                total, served = buckets["text_ocr"]
                buckets["text_ocr"] = (total + text, served + 1)
                if estimate.has_text_layer:
                    total, served = buckets["text_layer"]
                    buckets["text_layer"] = (total + text, served + 1)
            if vision is not None:
                total, served = buckets["vision"]
                buckets["vision"] = (total + vision, served + 1)

        architectures: list[ArchitectureCost] = []
        for key, label in ARCHITECTURES:
            total, served = buckets[key]
            per_document = total / served if served else None
            architectures.append(
                ArchitectureCost(
                    key=key,
                    label=label,
                    folder_usd=total if served else None,
                    per_document_usd=per_document,
                    per_1000_usd=per_document * 1000 if per_document is not None else None,
                    annual_usd=(
                        per_document * volume * 12 if per_document is not None and volume else None
                    ),
                    documents_served=served,
                    documents_total=total_documents,
                    note=_NOTES[key],
                )
            )
        comparisons.append(
            ModelComparison(
                model_id=model_id,
                display_name=display,
                provider=report.cost.documents[0].models[index].provider,
                architectures=architectures,
                batch_per_1000_usd=(batch_total / batch_served * 1000 if batch_served else None),
                price_source=report.cost.documents[0].models[index].price_source,
                input_per_mtok_usd=report.cost.documents[0].models[index].input_per_mtok_usd,
                supports_vision=report.cost.documents[0].models[index].supports_vision,
                vision_formula=report.cost.documents[0].models[index].vision_formula,
                tokenizer=report.cost.documents[0].models[index].tokenizer,
            )
        )
    return comparisons
