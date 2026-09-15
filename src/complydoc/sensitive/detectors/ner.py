"""Person and organisation names, via a local statistical model.

spaCy is an optional extra. When it is missing, this raises DetectorUnavailableError
so the affected categories are reported as not scanned.

The model is set per category in `sensitive.yaml`: an installed spaCy package or a
path to a saved pipeline, optionally one per language, with scores read from a span
group when `spans_key` is set. See `NerModelSpec`.

The model runs entirely locally. It is downloaded once at install time, like any
other dependency, and never contacts anything at scan time.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from complydoc.config.schema import NerModelSpec, SensitiveConfig
from complydoc.sensitive.base import DetectorContext, Finding
from complydoc.sensitive.registry import DetectorUnavailableError, detector
from complydoc.utils.text import detect_language

__all__ = ["NerDetector", "configured_models", "model_available"]

_MAX_CHARS = 400_000
"""spaCy's default parser ceiling; longer pages are truncated and the scan says so."""

_MIN_ALPHA = 2
"""Entities with fewer letters than this are discarded."""

_ACRONYM_MAX = 5
"""Single all-caps tokens up to this length are treated as field labels."""


@lru_cache(maxsize=4)
def _load(model_name: str) -> Any:
    try:
        import spacy
    except ImportError as exc:
        raise DetectorUnavailableError(
            "named entity recognition needs the optional NER extra "
            "(install with: uv sync --extra ner)"
        ) from exc
    try:
        # Entity recognition needs the embeddings and the entity head; the
        # tagger, the dependency parser, the attribute ruler and the lemmatiser
        # are a third of the run's time and nothing here reads their output.
        return spacy.load(
            model_name,
            exclude=["tagger", "parser", "attribute_ruler", "lemmatizer", "senter", "textcat"],
        )
    except OSError as exc:
        # `spacy download` shells out to pip, which a uv tool environment does
        # not have, so the instruction that works in a checkout does nothing for
        # anyone who installed complydoc as a tool. The README carries that one.
        raise DetectorUnavailableError(
            f"the local spaCy model {model_name!r} is not installed. In a checkout: "
            f"uv run python -m spacy download {model_name}. For a tool install, see "
            f"Install in the README"
        ) from exc


@lru_cache(maxsize=2)
def _parse(model_name: str, text: str) -> Any:
    """Run the model over one page, once.

    Every category that uses this detector asks about the same page, so without
    this the page is parsed once per category — twice over, for names and for
    organisations, at no benefit. The cache holds the page in hand and the one
    before it; it is not a store.
    """
    return _load(model_name)(text)


def configured_models(config: SensitiveConfig) -> list[str]:
    """Every model named by an enabled category that uses this detector, in order."""
    names: list[str] = []
    for category in config.enabled_categories.values():
        if category.detector == "ner" and category.model is not None:
            names.extend(category.model.model_names())
    return list(dict.fromkeys(names))


def _model_for(spec: NerModelSpec, text: str) -> tuple[str, list[str]]:
    """The model and entity labels for this page's language."""
    if spec.by_language:
        language = detect_language(text)
        chosen = spec.by_language.get(language) if language else None
        if chosen is not None:
            return chosen.name, chosen.entity_labels or spec.entity_labels
    return spec.name, spec.entity_labels


def _entities(document: Any, spec: NerModelSpec) -> list[tuple[str, int, int, float | None]]:
    """(label, start, end, score) for each entity the model returned."""
    if spec.spans_key is None:
        return [(e.label_, e.start_char, e.end_char, None) for e in document.ents]
    group = document.spans.get(spec.spans_key)
    if group is None:
        return []
    scores = group.attrs.get("scores")
    return [
        (
            span.label_,
            span.start_char,
            span.end_char,
            float(scores[i]) if scores is not None else None,
        )
        for i, span in enumerate(group)
    ]


def model_available(model_name: str) -> tuple[bool, str | None]:
    try:
        _load(model_name)
    except DetectorUnavailableError as exc:
        return False, str(exc)
    return True, None


@detector
class NerDetector:
    id = "ner"

    def find(self, text: str, context: DetectorContext) -> list[Finding]:
        spec = context.config.model
        if spec is None:
            raise DetectorUnavailableError(
                f"category {context.category_id!r} uses the NER detector but names no model"
            )
        name, labels = _model_for(spec, text)
        wanted = {label.upper() for label in labels}

        findings: list[Finding] = []
        document = _parse(name, text[:_MAX_CHARS])
        for label, start, end, score in _entities(document, spec):
            if label.upper() not in wanted:
                continue
            span = text[start:end]
            # An entity straddling a line break is usually an artefact of reading a
            # laid-out page as flat text: the end of one line run into the next.
            if spec.drop_multiline and ("\n" in span or "\r" in span):
                continue
            if sum(1 for c in span if c.isalpha()) < _MIN_ALPHA:
                continue
            # Forms are full of short upper-case field labels, such as IBAN, VAT and
            # UTR, which the small English model mistakes for organisation names.
            if (
                spec.drop_short_acronyms
                and len(span) <= _ACRONYM_MAX
                and span.isupper()
                and " " not in span.strip()
            ):
                continue
            # `doc.ents` carries no score, so confidence is None unless a span group
            # with scores was configured.
            findings.append(Finding(start=start, end=end, confidence=score))
        return findings
