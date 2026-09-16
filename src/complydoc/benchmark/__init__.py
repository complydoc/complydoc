"""Measured accuracy of identifier detection, against a labelled corpus.

The corpus is `corpus.yaml` beside this module: passages with the identifiers
they contain, and passages that contain none. Every value in it is fake, a
published test value, or a documented example.

A finding counts as a hit when it overlaps a labelled span and names the same
category. Scoring by overlap rather than by one finding per pattern is
deliberate: when two categories match the same digits, the scanner keeps the
better-evidenced one, so counting raw pattern hits would measure that resolver
instead of the detectors.

Two categories are backed by a statistical model rather than a pattern. With no
model installed they are reported as unmeasured, so a run without one does not
read as a run that found nothing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from importlib import resources
from typing import Any

import yaml

from complydoc.config.schema import SensitiveConfig
from complydoc.sensitive.scanner import scan_text

__all__ = ["BenchmarkResult", "CategoryScore", "Passage", "load_corpus", "run_benchmark"]


@dataclass(frozen=True, slots=True)
class Passage:
    id: str
    text: str
    expect: list[tuple[str, str]]
    note: str = ""


@dataclass
class CategoryScore:
    category: str
    found: int = 0
    """Labelled identifiers of this category the scan reported."""
    missed: int = 0
    wrongly_flagged: int = 0
    """Findings of this category that no label accounts for."""
    unmeasured: bool = False
    """Set when the detector could not run at all, such as a missing model."""
    misses: list[str] = field(default_factory=list)
    false_flags: list[str] = field(default_factory=list)

    @property
    def labelled(self) -> int:
        return self.found + self.missed

    @property
    def recall_pct(self) -> float | None:
        return round(100 * self.found / self.labelled, 1) if self.labelled else None

    @property
    def precision_pct(self) -> float | None:
        reported = self.found + self.wrongly_flagged
        return round(100 * self.found / reported, 1) if reported else None


@dataclass
class BenchmarkResult:
    categories: dict[str, CategoryScore] = field(default_factory=dict)
    by_evidence: dict[str, int] = field(default_factory=dict)
    """Reported findings by evidence tier, across the whole corpus."""
    passages: int = 0
    clean_passages: int = 0
    clean_passages_with_a_flag: int = 0
    """Passages labelled as holding nothing where something was reported anyway."""
    model_backed: set[str] = field(default_factory=set)
    """Categories a statistical model finds, scored apart from the patterns."""
    model_name: str | None = None
    """Which model produced the name scores, when one ran."""

    @property
    def measured(self) -> list[CategoryScore]:
        """The pattern-backed categories, which is what the published numbers cover."""
        return [
            s
            for s in self.categories.values()
            if not s.unmeasured and s.category not in self.model_backed
        ]

    @property
    def names(self) -> list[CategoryScore]:
        """The model-backed categories, measured only when the detector ran."""
        return [
            s
            for s in self.categories.values()
            if not s.unmeasured and s.category in self.model_backed
        ]

    @property
    def names_measured(self) -> bool:
        return bool(self.names)

    @property
    def names_labelled(self) -> int:
        return sum(s.labelled for s in self.names)

    @property
    def names_found(self) -> int:
        return sum(s.found for s in self.names)

    @property
    def names_wrongly_flagged(self) -> int:
        return sum(s.wrongly_flagged for s in self.names)

    @property
    def names_recall_pct(self) -> float | None:
        total = self.names_labelled
        return round(100 * self.names_found / total, 1) if total else None

    @property
    def names_precision_pct(self) -> float | None:
        reported = self.names_found + self.names_wrongly_flagged
        return round(100 * self.names_found / reported, 1) if reported else None

    @property
    def labelled_total(self) -> int:
        return sum(s.labelled for s in self.measured)

    @property
    def found_total(self) -> int:
        return sum(s.found for s in self.measured)

    @property
    def missed_total(self) -> int:
        return sum(s.missed for s in self.measured)

    @property
    def wrongly_flagged_total(self) -> int:
        return sum(s.wrongly_flagged for s in self.measured)

    @property
    def recall_pct(self) -> float | None:
        total = self.labelled_total
        return round(100 * self.found_total / total, 1) if total else None

    @property
    def precision_pct(self) -> float | None:
        reported = self.found_total + self.wrongly_flagged_total
        return round(100 * self.found_total / reported, 1) if reported else None


def load_corpus() -> list[Passage]:
    """The labelled passages shipped with the package."""
    source = resources.files(__package__).joinpath("corpus.yaml").read_text(encoding="utf-8")
    data: dict[str, Any] = yaml.safe_load(source)
    return [
        Passage(
            id=entry["id"],
            text=entry["text"],
            expect=[(category, value) for category, value in entry.get("expect", [])],
            note=entry.get("note", ""),
        )
        for entry in data["passages"]
    ]


def _spans(text: str, expect: list[tuple[str, str]]) -> list[tuple[str, int, int, str]]:
    """Each labelled value located in the passage, as (category, start, end, value)."""
    located = []
    for category, value in expect:
        start = text.find(value)
        if start < 0:
            raise ValueError(f"the corpus labels {value!r} but the passage does not contain it")
        located.append((category, start, start + len(value), value))
    return located


def _model_name(config: SensitiveConfig, categories: list[str]) -> str | None:
    """What produced the name scores: the model, or the detector standing in for it."""
    for category_id in categories:
        category = config.categories[category_id]
        if category.detector != "ner":
            return f"detector: {category.detector}"
        if category.model is not None:
            return str(category.model.name)
    return None


def run_benchmark(config: SensitiveConfig, corpus: list[Passage] | None = None) -> BenchmarkResult:
    """Score the shipped detectors against the labelled corpus."""
    passages = load_corpus() if corpus is None else corpus
    result = BenchmarkResult(passages=len(passages))

    # Names come from a statistical model rather than a pattern, so they are
    # scored in their own group. The published numbers cover the patterns, which
    # score the same on every machine; a name score describes the model that
    # happens to be installed and is reported beside them.
    # A category is model-backed when it carries a model, whichever detector
    # reads it. Keying on the detector's name would drop a category the caller
    # pointed at a detector of their own, and its findings would then be scored
    # as patterns, which is what the published numbers must never include.
    model_backed = {
        category_id
        for category_id, category in config.categories.items()
        if category.model is not None or category.detector == "ner"
    }
    result.model_backed = set(model_backed)
    result.model_name = _model_name(config, sorted(model_backed))

    def score(category: str) -> CategoryScore:
        return result.categories.setdefault(category, CategoryScore(category=category))

    for passage in passages:
        matches, unavailable = scan_text(passage.text, config)
        for category in unavailable:
            score(category).unmeasured = True

        labels = _spans(passage.text, passage.expect)
        claimed: set[int] = set()

        for match in matches:
            if match.category not in model_backed:
                result.by_evidence[match.evidence] = result.by_evidence.get(match.evidence, 0) + 1
            start = _offset(passage.text, match.line, match.column)
            end = start + match.length
            hit = next(
                (
                    index
                    for index, (category, label_start, label_end, _) in enumerate(labels)
                    if index not in claimed
                    and category == match.category
                    and start < label_end
                    and label_start < end
                ),
                None,
            )
            if hit is None:
                entry = score(match.category)
                entry.wrongly_flagged += 1
                entry.false_flags.append(f"{passage.id}: {match.masked}")
            else:
                claimed.add(hit)
                score(match.category).found += 1

        for index, (category, _, _, value) in enumerate(labels):
            if index not in claimed:
                entry = score(category)
                entry.missed += 1
                entry.misses.append(f"{passage.id}: {value}")

        if not passage.expect:
            result.clean_passages += 1
            # A name a model thought it saw is reported with the names, so that
            # this count says the same thing on a machine without one.
            if any(m.category not in model_backed for m in matches):
                result.clean_passages_with_a_flag += 1

    return result


def _offset(text: str, line: int, column: int) -> int:
    """A match's line and column as an offset into `text`.

    The scanner reports a 1-indexed line and a 0-indexed column.
    """
    lines = text.splitlines(keepends=True)
    return sum(len(x) for x in lines[: line - 1]) + column
