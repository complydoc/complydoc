"""Person and organisation names, via a local token-classification model.

The shipped configuration uses spaCy, which is small and English. A
transformer model reads the European languages these documents are actually
written in, and measurably better: see Detection accuracy for the numbers.

    sensitive:
      categories:
        person_name:
          detector: token_classifier
          model:
            name: Babelscape/wikineural-multilingual-ner
            entity_labels: [PER]

`transformers` is an optional extra, and the weights are loaded from files
already on the machine. Nothing here downloads a model: a scan runs inside the
network guard, so a model that is not already on disk is reported as a category
that could not be scanned, with how to fetch it.

A token-classification model reads a few hundred tokens at a time. A page is
longer than that, so it is cut into windows at line boundaries and each window
is read on its own, with the offsets moved back onto the page.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from complydoc.config.schema import SensitiveConfig
from complydoc.sensitive.base import DetectorContext, Finding
from complydoc.sensitive.registry import DetectorUnavailableError, detector
from complydoc.utils.install import extra_hint, hf_model_hint

__all__ = ["TokenClassifierDetector", "configured_models", "model_available"]

_MIN_ALPHA = 2
"""Entities with fewer letters than this are discarded."""

_ACRONYM_MAX = 5
"""Single all-caps tokens up to this length are treated as field labels."""

_WINDOW_CHARS = 1200
"""Characters read at a time. Comfortably inside the usual 512-token ceiling."""


def _install_hint(model_name: str) -> str:
    return f"{hf_model_hint(model_name)}, after you {extra_hint('multilingual-names')}"


@lru_cache(maxsize=2)
def _load(model_name: str) -> Any:
    # Set before the library is imported. `huggingface_hub` reads these once, as
    # it is imported, and a value set afterwards is never seen: the weights come
    # from the cache either way, but the tokenizer asks the hub for its templates
    # and a scan's network guard stops the run there.
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"

    try:
        from transformers import pipeline
    except ImportError as exc:
        raise DetectorUnavailableError(
            f"the token classifier needs the optional extra ({extra_hint('multilingual-names')})"
        ) from exc

    from complydoc.offline import NetworkAccessError

    try:
        return pipeline(
            "token-classification",
            model=model_name,
            aggregation_strategy="simple",
        )
    except (OSError, ValueError, NetworkAccessError) as exc:
        # What a model that is not on this machine looks like. The guard is
        # armed for the whole of a scan, so weights that are absent locally end
        # as a blocked connection rather than a missing file, and both mean the
        # same thing to whoever has to fix it.
        #
        # Anything else is a fault worth seeing in full, so it is not dressed up
        # as a missing model: saying "not installed" about a library mismatch
        # sends the reader to fetch a model they already have.
        raise DetectorUnavailableError(f"{_install_hint(model_name)} ({exc})") from exc
    except Exception as exc:
        raise DetectorUnavailableError(
            f"the token classifier could not load {model_name!r}: {type(exc).__name__}: {exc}"
        ) from exc


def model_available(model_name: str) -> tuple[bool, str | None]:
    """Whether the model loads from files already on this machine."""
    try:
        _load(model_name)
    except DetectorUnavailableError as exc:
        return False, str(exc)
    return True, None


def configured_models(config: SensitiveConfig) -> list[str]:
    """Every model named by an enabled category that uses this detector, in order."""
    names: list[str] = []
    for category in config.enabled_categories.values():
        # Every link, not just the first: a category names the detectors to try
        # in order, and a model further down the chain is still configured.
        for detector_id, link in category.chain():
            if detector_id == TokenClassifierDetector.id and link.model is not None:
                names.extend(link.model.model_names())
    return list(dict.fromkeys(names))


def _windows(text: str) -> list[tuple[int, str]]:
    """The page in pieces small enough to read, as (offset, piece).

    Cut at line boundaries: an entity split across two windows would be lost,
    and one split across a line break is dropped anyway.
    """
    if len(text) <= _WINDOW_CHARS:
        return [(0, text)]
    pieces: list[tuple[int, str]] = []
    start = 0
    while start < len(text):
        end = min(start + _WINDOW_CHARS, len(text))
        if end < len(text):
            cut = text.rfind("\n", start, end)
            if cut > start:
                end = cut + 1
        pieces.append((start, text[start:end]))
        start = end
    return pieces


@detector
class TokenClassifierDetector:
    id = "token_classifier"

    def find(self, text: str, context: DetectorContext) -> list[Finding]:
        spec = context.config.model
        if spec is None:
            raise DetectorUnavailableError(
                f"category {context.category_id!r} uses the token classifier but names no model"
            )
        classify = _load(spec.name)
        wanted = {label.upper() for label in spec.entity_labels}

        findings: list[Finding] = []
        for offset, piece in _windows(text):
            if not piece.strip():
                continue
            for entity in classify(piece):
                if str(entity.get("entity_group", "")).upper() not in wanted:
                    continue
                start = offset + int(entity["start"])
                end = offset + int(entity["end"])
                span = text[start:end]
                if spec.drop_multiline and ("\n" in span or "\r" in span):
                    continue
                if sum(1 for character in span if character.isalpha()) < _MIN_ALPHA:
                    continue
                if (
                    spec.drop_short_acronyms
                    and len(span) <= _ACRONYM_MAX
                    and span.isupper()
                    and " " not in span.strip()
                ):
                    continue
                findings.append(Finding(start=start, end=end, confidence=float(entity["score"])))
        return findings
