"""Pattern-based detection for the structured UK identifiers.

Two kinds of pattern are supported. `patterns` are distinctive enough to report
on sight. `context_patterns` are bare runs of digits that would carpet a business
document with false positives, so they are only reported when a label such as
"account number" appears within a short window.

A pattern may name the part that is the identifier with a group called `value`, where
what identifies it is beside it and not part of it: in `Name: Jane Doe` the name is the
value. A group called `label` is then the label it was found by, and the finding is
reported as one corroborated by that label.
"""

from __future__ import annotations

import re
from functools import lru_cache

from complydoc.sensitive.base import DetectorContext, Finding
from complydoc.sensitive.registry import detector

_CONTEXT_CONFIDENCE = 0.8


@lru_cache(maxsize=256)
def _compiled(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE)


def _nearby_term(
    text: str, start: int, end: int, terms: tuple[str, ...], window: int
) -> str | None:
    """The first configured label found within `window` characters of the match."""
    if not terms:
        return None
    left = max(0, start - window)
    haystack = text[left:start].lower() + " " + text[end : end + window].lower()
    for term in terms:
        if term.lower() in haystack:
            return term
    return None


@detector
class RegexDetector:
    id = "regex"

    def find(self, text: str, context: DetectorContext) -> list[Finding]:
        config = context.config
        findings: list[Finding] = []

        for pattern in config.patterns:
            compiled = _compiled(pattern)
            valued = "value" in compiled.groupindex
            labelled = "label" in compiled.groupindex
            for match in compiled.finditer(text):
                start, end = match.span("value") if valued else match.span()
                if start < 0 or start == end:
                    continue
                label = match.group("label") if labelled else None
                findings.append(
                    Finding(
                        start=start,
                        end=end,
                        confidence=1.0,
                        context_term=label.strip().lower() if label else None,
                    )
                )

        if config.context_patterns:
            terms = tuple(config.context_terms)
            for pattern in config.context_patterns:
                for match in _compiled(pattern).finditer(text):
                    term = _nearby_term(
                        text, match.start(), match.end(), terms, config.context_window_chars
                    )
                    if term is None:
                        continue
                    findings.append(
                        Finding(
                            start=match.start(),
                            end=match.end(),
                            confidence=_CONTEXT_CONFIDENCE,
                            context_term=term,
                        )
                    )
        return findings
