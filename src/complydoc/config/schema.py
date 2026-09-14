"""Pydantic models for the configuration files.

Prices, token formulas, signal weights, rating thresholds and detection patterns
live in YAML and are validated here.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Rating = Literal["good", "fair", "poor"]
Severity = Literal["low", "medium", "high"]
Direction = Literal["higher_is_better", "lower_is_better"]
Fidelity = Literal["exact", "approximate"]


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# --------------------------------------------------------------------------
# pricing.yaml
# --------------------------------------------------------------------------


class TiledVisionFormula(_Base):
    """Providers that split an image into fixed tiles and charge per tile."""

    kind: Literal["tiled"]
    base_tokens: int
    tile_tokens: int
    tile_px: int
    max_short_side_px: int
    max_long_side_px: int
    notes: str | None = None


class WidthHeightVisionFormula(_Base):
    """Providers that charge on raw pixel area: tokens = (w * h) / divisor."""

    kind: Literal["width_height"]
    divisor: float
    cap_tokens: int | None = None
    notes: str | None = None


class FlatVisionFormula(_Base):
    """Providers that charge a flat count per image below a size threshold."""

    kind: Literal["flat_per_image"]
    tokens_per_image: int
    tile_above_px: int | None = None
    tile_tokens: int | None = None
    notes: str | None = None


VisionFormula = Annotated[
    TiledVisionFormula | WidthHeightVisionFormula | FlatVisionFormula,
    Field(discriminator="kind"),
]


class ResolutionPreset(_Base):
    long_edge_px: int


class TokenizerSpec(_Base):
    encoding: str
    fidelity: Fidelity
    approximation_note: str | None = None
    approximate_ratio: float = 1.0
    """Multiplier applied to the encoding's count when fidelity is approximate."""

    @model_validator(mode="after")
    def _note_required_when_approximate(self) -> TokenizerSpec:
        if self.fidelity == "approximate" and not self.approximation_note:
            raise ValueError("approximation_note is required when fidelity is 'approximate'")
        return self


class ModelPricing(_Base):
    id: str
    provider: str
    display_name: str
    enabled: bool = True

    @model_validator(mode="after")
    def _named_not_identified(self) -> ModelPricing:
        """A model that carries its own id as its name borrows the catalogue's.

        An entry written in a hurry gets `display_name` equal to `id`, and the
        chart then reads `zai/glm-5.3-flash` beside `Claude Sonnet 5`. The
        catalogue almost always knows what the provider calls it.
        """
        if self.display_name == self.id:
            from complydoc.cost.price_table import display_name_for

            better = display_name_for(self.id)
            if better:
                object.__setattr__(self, "display_name", better)
        return self

    input_per_mtok_usd: float | None = None
    output_per_mtok_usd: float | None = None
    batch_input_per_mtok_usd: float | None = None
    """Input price on the provider's batch endpoint, where it publishes one.

    Left empty when the provider publishes no batch price.
    """
    supports_vision: bool = True
    vision_formula: str | None = None
    tokenizer: TokenizerSpec
    input_tokens_per_second: float | None = None
    """Observed prefill throughput, for estimating how long a document takes.

    Left unset because complydoc cannot measure it offline and will not invent it.
    Set it from your own benchmark and the report will estimate processing time;
    leave it and the report says the time was not estimated.
    """
    last_verified: dt.date | None = None
    source_url: str | None = None
    notes: str | None = None
    price_source: Literal["verified", "imported"] = "verified"
    """Where the number came from.

    "verified" means a person read it off the provider's own page and stamped
    `last_verified`. "imported" means it was taken from a maintained third-party
    table on `imported_on` and has not been checked. The report shows which.
    """
    imported_on: dt.date | None = None

    @property
    def is_priced(self) -> bool:
        return self.input_per_mtok_usd is not None

    @property
    def has_batch_price(self) -> bool:
        return self.batch_input_per_mtok_usd is not None

    def days_since_verified(self, today: dt.date) -> int | None:
        if self.last_verified is None:
            return None
        return (today - self.last_verified).days


class FxRate(_Base):
    rate: float | None = None
    """None means no verified rate is configured; costs stay in USD."""

    last_verified: dt.date | None = None
    source_url: str | None = None


class ParserPricing(_Base):
    """Per-page price of a document parser, for `complydoc.parsers` presets."""

    display_name: str
    usd_per_1000_pages: float | None = None
    """None when no price is configured."""
    last_verified: dt.date | None = None
    source_url: str | None = None
    notes: str | None = None


class CurrencyConfig(_Base):
    report_in: str = "GBP"
    usd_to_gbp: FxRate


class CompareConfig(_Base):
    """How many models the report compares, and how they are chosen.

    The curated entries are always in. Below `per_provider`, each provider is
    topped up from the vendored catalogue with its most recently released models
    that take images, so refreshing the catalogue refreshes the comparison.
    """

    providers: list[str] = []
    """Which providers the default comparison covers. Empty means all of them."""
    per_provider: int = 4
    """How many models each provider contributes, spread across its price range.

    One model per product line, so the comparison spans the price range: for
    Anthropic, haiku, sonnet, opus and fable.
    """
    top_up_from_catalogue: bool = True
    headline_model: str = "claude-sonnet-5"
    """The model the summary quotes when it has to name one number.

    The report compares a dozen models, but the figure on the front page has to
    be a figure, and that means picking one. The cheapest in the comparison was
    the wrong pick: it is whichever small model happened to be cheapest that
    week, so the headline moved for reasons that had nothing to do with the
    folder. A mid-range model in wide use stays fixed between catalogue refreshes.

    Falls back to the cheapest priced model in the comparison when this one is
    not among them, and the report says which it used either way.
    """


class PricingConfig(_Base):
    schema_version: int
    staleness_warn_days: int = 90
    compare: CompareConfig = CompareConfig()
    currency: CurrencyConfig
    vision_formulas: dict[str, VisionFormula]
    resolution_presets: dict[str, ResolutionPreset]
    models: list[ModelPricing]
    parsers: dict[str, ParserPricing] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _formulas_resolve(self) -> PricingConfig:
        for model in self.models:
            key = model.vision_formula
            if key is not None and key not in self.vision_formulas:
                raise ValueError(f"model {model.id!r} references unknown vision_formula {key!r}")
        return self

    def model_by_id(self, model_id: str) -> ModelPricing | None:
        return next((m for m in self.models if m.id == model_id), None)

    @property
    def usable_models(self) -> list[ModelPricing]:
        """Models that are switched on and carry a price."""
        return [m for m in self.models if m.enabled and m.is_priced]


# --------------------------------------------------------------------------
# readiness.yaml
# --------------------------------------------------------------------------


class Threshold(_Base):
    """A single comparison. Exactly one operator must be set."""

    gte: float | None = None
    gt: float | None = None
    lte: float | None = None
    lt: float | None = None
    eq: float | bool | str | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> Threshold:
        set_ops = [op for op in (self.gte, self.gt, self.lte, self.lt, self.eq) if op is not None]
        if len(set_ops) != 1:
            raise ValueError("a threshold must set exactly one of gte/gt/lte/lt/eq")
        return self

    def matches(self, value: float | bool | str | None) -> bool:
        if value is None:
            return False
        if self.eq is not None:
            return bool(value == self.eq)
        if isinstance(value, str):
            return False
        numeric = float(value)
        if self.gte is not None:
            return numeric >= self.gte
        if self.gt is not None:
            return numeric > self.gt
        if self.lte is not None:
            return numeric <= self.lte
        if self.lt is not None:
            return numeric < self.lt
        return False


class SignalConfig(_Base):
    enabled: bool = True
    weight: float = 0.0
    direction: Direction = "higher_is_better"
    thresholds: dict[Rating, Threshold] = Field(default_factory=dict)
    why: str | None = None
    """Overrides the default explanation carried by the signal module."""

    def rate(self, value: float | bool | str | None) -> Rating | None:
        """First matching rating wins, checked good then fair then poor."""
        order: tuple[Rating, ...] = ("good", "fair", "poor")
        for rating in order:
            threshold = self.thresholds.get(rating)
            if threshold is not None and threshold.matches(value):
                return rating
        return None


def _default_rating_points() -> dict[Rating, float]:
    return {"good": 1.0, "fair": 0.5, "poor": 0.0}


class ScoringConfig(_Base):
    enabled: bool = True
    method: Literal["weighted_sum"] = "weighted_sum"
    show_breakdown_by_default: bool = True
    print_weights_in_report: bool = True
    rating_points: dict[Rating, float] = Field(default_factory=_default_rating_points)

    @model_validator(mode="after")
    def _weights_must_be_visible(self) -> ScoringConfig:
        if self.enabled and not self.print_weights_in_report:
            raise ValueError(
                "scoring.enabled requires print_weights_in_report: true — a score whose "
                "weights are not shown in the report is not allowed"
            )
        return self


class OverallConfig(_Base):
    """How the three factors combine into one global readiness score.

    Content is weighted heaviest because it is the question the others depend
    on: a page nothing can be read from has no cost path and no exposure worth
    measuring. The weights do not have to sum to one; they are renormalised
    over the factors the run measured.
    """

    enabled: bool = True
    content_weight: float = 0.5
    cost_weight: float = 0.25
    exposure_weight: float = 0.25
    recognised_page_score: float = 60.0
    """What a page worth, out of 100, when its text had to be recognised.

    OCR puts the document on the text path at the model, but costs machine
    time and can introduce recognition errors.
    """
    points_per_exposure: float = 4.0
    """Points off per unit of exposure, where one unit is a low-severity
    finding that passed a checksum. A confirmed high-severity finding is three
    units, so twelve points."""

    @model_validator(mode="after")
    def _some_weight_somewhere(self) -> OverallConfig:
        if self.enabled and self.content_weight + self.cost_weight + self.exposure_weight <= 0:
            raise ValueError("overall.enabled needs at least one factor with a weight above zero")
        return self


class ReadinessConfig(_Base):
    schema_version: int
    scoring: ScoringConfig
    overall: OverallConfig = OverallConfig()
    signals: dict[str, SignalConfig]

    def for_signal(self, signal_id: str) -> SignalConfig | None:
        return self.signals.get(signal_id)


# --------------------------------------------------------------------------
# sensitive.yaml
# --------------------------------------------------------------------------


class MaskingConfig(_Base):
    reveal_tail_chars: int = 4
    mask_char: str = "•"
    never_reveal: list[str] = Field(default_factory=list)
    """Categories that stay masked even when --reveal is passed."""


class NerModelSpec(_Base):
    name: str
    version: str | None = None
    entity_labels: list[str]


class CategoryConfig(_Base):
    enabled: bool = True
    label: str
    region: str = "international"
    """Which jurisdiction the identifier belongs to, shown in the report."""
    detector: str
    severity: Severity = "medium"
    patterns: list[str] = Field(default_factory=list)
    """Patterns distinctive enough to report on their own."""
    context_patterns: list[str] = Field(default_factory=list)
    """Patterns too generic to stand alone — a bare run of digits, say. A hit is
    only reported when one of `context_terms` appears within
    `context_window_chars` of it."""
    validators: list[str] = Field(default_factory=list)
    context_terms: list[str] = Field(default_factory=list)
    context_window_chars: int = 60
    min_confidence: float = 0.0
    gdpr_note: str | None = None
    model: NerModelSpec | None = None


class SensitiveConfig(_Base):
    schema_version: int
    masking: MaskingConfig
    categories: dict[str, CategoryConfig]

    @property
    def enabled_categories(self) -> dict[str, CategoryConfig]:
        return {k: v for k, v in self.categories.items() if v.enabled}


# --------------------------------------------------------------------------
# hidden.yaml
# --------------------------------------------------------------------------


class VisibilityConfig(_Base):
    render_dpi: int = Field(default=100, ge=36, le=600)
    """Resolution a PDF page is drawn at to see what a reader would see."""
    min_contrast: int = Field(default=16, ge=0, le=255)
    """Grey levels between the lightest and darkest pixel under a glyph below
    which nothing visible is drawn there."""
    min_font_size_pt: float = 1.0
    min_characters: int = 4
    """Letters or digits a passage needs before it is reported."""
    min_hidden_share: float = Field(default=0.8, ge=0.0, le=1.0)
    near_white: float = Field(default=0.94, ge=0.0, le=1.0)
    zero_width_run: int = 8
    max_pages: int = 500


class InstructionPattern(_Base):
    id: str
    label: str
    languages: list[str] = Field(default_factory=list)
    regexes: list[str]

    @model_validator(mode="after")
    def _compiles(self) -> InstructionPattern:
        import re

        for regex in self.regexes:
            try:
                re.compile(regex)
            except re.error as exc:
                raise ValueError(f"pattern {self.id!r}: {regex!r} does not compile: {exc}") from exc
        return self


class InstructionsConfig(_Base):
    classifier_threshold: float = Field(default=0.8, ge=0.0, le=1.0)
    patterns: list[InstructionPattern] = Field(default_factory=list)


class HiddenConfig(_Base):
    schema_version: int
    visibility: VisibilityConfig = VisibilityConfig()
    instructions: InstructionsConfig = InstructionsConfig()


def _shipped_hidden() -> HiddenConfig:
    from pathlib import Path

    import yaml

    raw = yaml.safe_load((Path(__file__).parent / "hidden.yaml").read_text(encoding="utf-8"))
    return HiddenConfig.model_validate(raw)


class Config(_Base):
    """The configuration files, loaded together."""

    pricing: PricingConfig
    readiness: ReadinessConfig
    sensitive: SensitiveConfig
    hidden: HiddenConfig = Field(default_factory=_shipped_hidden)
    source_dir: str
    digest: str

    def override(self, changes: Mapping[str | tuple[str, ...], Any]) -> Config:
        """A validated copy with settings replaced.

        Keys are dotted paths such as `"readiness.signals.table_count.weight"`, or
        tuples for names containing dots: `("pricing", "models", "gpt-4.1", "enabled")`.
        A list of models is indexed by `id`. A missing final key is added, so new
        signals, categories and parser prices can be configured. The copy gets its
        own digest.
        """
        import hashlib
        import json

        from complydoc.config.loader import ConfigError

        data = self.model_dump()
        for path, value in changes.items():
            keys = path.split(".") if isinstance(path, str) else list(path)
            _assign(data, keys, value, ".".join(keys))
        description = json.dumps(
            {".".join(k) if isinstance(k, tuple) else k: v for k, v in changes.items()},
            sort_keys=True,
            default=str,
        )
        data["digest"] = hashlib.sha256((self.digest + description).encode()).hexdigest()[:16]
        try:
            return Config.model_validate(data)
        except ValueError as exc:
            raise ConfigError(f"the override is invalid:\n{exc}") from exc


def _assign(node: Any, keys: list[str], value: Any, path: str) -> None:
    from complydoc.config.loader import ConfigError

    for position, key in enumerate(keys):
        last = position == len(keys) - 1
        if isinstance(node, dict):
            if last:
                node[key] = value
                return
            if key not in node:
                raise ConfigError(f"no setting at {path!r}: {key!r} does not exist")
            node = node[key]
        elif isinstance(node, list):
            index = next(
                (
                    i
                    for i, item in enumerate(node)
                    if isinstance(item, dict) and item.get("id") == key
                ),
                None,
            )
            if index is None and key.isdigit() and int(key) < len(node):
                index = int(key)
            if index is None:
                raise ConfigError(f"no setting at {path!r}: no entry {key!r}")
            if last:
                node[index] = value
                return
            node = node[index]
        else:
            raise ConfigError(f"no setting at {path!r}: {key!r} is inside a value")
    """SHA-256 over the raw configuration files."""
