"""Whether text reads as an instruction to a model.

Nothing here establishes intent. A policy that says "you must not" and a paper
about prompt injection both contain instruction-like phrasing. A match is
reported at the tier of evidence it is — a pattern, or a classifier's score —
and the report weighs it together with whether the text is visible.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from complydoc.config.schema import InstructionsConfig

__all__ = [
    "JEV_THRESHOLD",
    "SENDS_TEXT_OFF_THE_MACHINE",
    "Classifier",
    "ClassifierError",
    "InstructionMatch",
    "InstructionMatcher",
    "classifier_calls",
    "classifier_score",
    "matcher_for",
    "register_instruction_classifier",
    "registered_classifier",
    "resolve_classifier",
]

Classifier = Callable[[str], float]

_classifier: Classifier | None = None

_calls = 0
_failures = 0
"""Counted per process, because that is where a classifier lives.

A call that raises is treated as no score, which is right: a service that is
down must not read as a document that is clean. But no score also means no
finding, so a run whose every call failed looked exactly like a run that found
nothing. These are what let a report tell those two apart.
"""


def classifier_calls() -> tuple[int, int]:
    """Calls made and calls that failed in this process, then reset to zero.

    Read after each document, so the counts can be carried back from a worker
    and added up by the process that started it.
    """
    global _calls, _failures
    counts = (_calls, _failures)
    _calls = _failures = 0
    return counts


def register_instruction_classifier(classifier: Classifier | None) -> None:
    """Score passages with a classifier as well as the patterns.

    `classifier` takes a passage and returns how likely it is to be an injected
    instruction, from 0 to 1. A passage at or above
    `instructions.classifier_threshold` in `hidden.yaml` is reported at the
    `model` tier. Pass None to remove it.

    complydoc ships and downloads no model. The classifier runs inside the
    network guard, so it has to load from files already on the machine. It is
    registered in this process only: audits with `jobs` above 1 run their
    documents in worker processes that do not have it.
    """
    global _classifier
    _classifier = classifier


def registered_classifier() -> Classifier | None:
    return _classifier


def classifier_score(text: str) -> float | None:
    """The registered classifier's score, or None when there is none or it failed."""
    global _calls, _failures

    if _classifier is None or not text.strip():
        return None
    _calls += 1
    try:
        value = float(_classifier(text))
    # A registered classifier is caller code; whatever it raises means no score.
    except Exception:
        _failures += 1
        return None
    return round(min(1.0, max(0.0, value)), 3)


SENDS_TEXT_OFF_THE_MACHINE = frozenset({"jev"})
"""Named classifiers that reach a third party, rather than staying local.

Used to decide what a command has to say before it runs, not to decide whether
to allow it. A `module:function` classifier is caller code, and complydoc cannot
know where it sends anything, so it is not on this list and not vouched for.
"""

JEV_THRESHOLD = 0.5
"""Measured for Jev: it puts ordinary prose under 0.05 and the weakest real
injection at 0.60. See docs/explanation/accuracy.md."""


class ClassifierError(ValueError):
    """A `--classifier` value that could not be turned into a classifier."""


def resolve_classifier(spec: str) -> Classifier:
    """Build the classifier `spec` names.

    `jev` is TypeSafe's hosted judgement model, through the `typesafe` extra.
    Anything containing a colon is `module:function`, imported and called with
    no arguments; what it returns is the classifier.
    """
    name = spec.strip()
    if not name:
        raise ClassifierError("no classifier named")

    if name.lower() == "jev":
        try:
            from complydoc.integrations.typesafe import jev_classifier
        except ImportError as exc:  # pragma: no cover - depends on the extra
            raise ClassifierError(
                "jev needs the optional extra: uv tool install 'complydoc[typesafe]'"
            ) from exc
        try:
            # The flag is the caller saying the passages leave the machine, which
            # is what this argument means. It is not defaulted anywhere else.
            return jev_classifier(allow_network=True)
        except ValueError as exc:
            raise ClassifierError(str(exc)) from exc

    if ":" not in name:
        raise ClassifierError(
            f"unknown classifier {name!r}: use 'jev', or 'module:function' for your own"
        )

    module_name, _, attribute = name.partition(":")
    try:
        from importlib import import_module

        module = import_module(module_name)
    except ImportError as exc:
        raise ClassifierError(f"cannot import {module_name!r}: {exc}") from exc

    factory = getattr(module, attribute, None)
    if factory is None:
        raise ClassifierError(f"{module_name!r} has no {attribute!r}")
    if not callable(factory):
        raise ClassifierError(f"{name} is not callable")

    built = factory()
    if not callable(built):
        raise ClassifierError(f"{name}() returned {type(built).__name__}, not a callable")
    return built  # type: ignore[no-any-return]


@dataclass(frozen=True, slots=True)
class InstructionMatch:
    pattern_id: str
    label: str
    start: int
    end: int


class InstructionMatcher:
    """The patterns from `hidden.yaml`, compiled once."""

    def __init__(self, config: InstructionsConfig) -> None:
        self._compiled = [
            (pattern.id, pattern.label, re.compile(regex, re.IGNORECASE | re.MULTILINE))
            for pattern in config.patterns
            for regex in pattern.regexes
        ]

    def find(self, text: str) -> list[InstructionMatch]:
        found = [
            InstructionMatch(pattern_id, label, match.start(), match.end())
            for pattern_id, label, regex in self._compiled
            for match in regex.finditer(text)
        ]
        return sorted(found, key=lambda m: (m.start, m.end))


_matchers: dict[int, tuple[InstructionsConfig, InstructionMatcher]] = {}


def matcher_for(config: InstructionsConfig) -> InstructionMatcher:
    cached = _matchers.get(id(config))
    if cached is None or cached[0] is not config:
        cached = (config, InstructionMatcher(config))
        _matchers[id(config)] = cached
    return cached[1]
