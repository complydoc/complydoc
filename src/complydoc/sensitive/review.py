"""A second look at a page's findings, by code another package brings.

complydoc's detectors each answer for their own category. A reviewer sees all of a page's
findings at once, with the page, and returns the ones to report: it can drop a find it
judges wrong, give one a score of its own, and add what the detectors missed. Veil's engine
names one, which reads the page with a Veil model and combines that reading with complydoc's
checks (veil.complydoc).

    sensitive:
      review: veil.complydoc:review

The value is an import path, "module:attribute", to a callable

    review(text: str, found: list[Reviewed]) -> list[Reviewed]

A reviewer that fails to load or raises is said once on stderr and passed over: the page is
reported as complydoc found it. What a reviewer returns in a category the configuration does
not have is left out.
"""

from __future__ import annotations

import importlib
import sys
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from complydoc.sensitive.base import Evidence

__all__ = ["Reviewed", "Reviewer", "load", "said"]


@dataclass(frozen=True, slots=True)
class Reviewed:
    """A finding as a reviewer sees it, and as it hands one back."""

    start: int
    end: int
    category: str
    confidence: float | None = None
    evidence: Evidence | None = None
    """How complydoc found it; None for a finding the reviewer added."""
    context_term: str | None = None


Reviewer = Callable[[str, list[Reviewed]], list[Reviewed]]

_said: set[str] = set()


def said(path: str, failure: BaseException) -> None:
    """Say on stderr, once per reviewer, that it was passed over and why."""
    if path in _said:
        return
    _said.add(path)
    print(
        f"complydoc: reviewer {path!r} not used: {type(failure).__name__}: {failure}",
        file=sys.stderr,
    )


@lru_cache(maxsize=4)
def load(path: str) -> Reviewer:
    module, _, attribute = path.partition(":")
    if not module or not attribute:
        raise ValueError(f"a reviewer is named 'module:attribute', not {path!r}")
    found: Any = importlib.import_module(module)
    for part in attribute.split("."):
        found = getattr(found, part)
    if not callable(found):
        raise TypeError(f"{path} is not callable")
    return found
