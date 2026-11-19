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
    """The first configured label found within `window` characters of the match.

    The label has to be on the match's own line, or on the line above when the match's
    line has no words before it: a value under its column header, or alone on the line
    after its label. A label two lines away belongs to another field, so "Data de
    nascimento" under a meter reading does not make the reading's date a birth date.

    A term matches whole words only. As a substring, "ach" was found in "Machado" and
    "nie" in "Daniel".
    """
    if not terms:
        return None
    line_start = text.rfind("\n", 0, start) + 1
    line_end = text.find("\n", end)
    if line_end < 0:
        line_end = len(text)
    before = text[max(line_start, start - window) : start]
    if line_start > 0 and not _WORDS.search(before):
        above = text.rfind("\n", 0, line_start - 1) + 1
        before = text[max(above, start - window) : line_start - 1] + " " + before
    haystack = before.lower() + " " + text[end : min(line_end, end + window)].lower()
    for term in terms:
        if _term_pattern(term.lower()).search(haystack):
            return term
    return None


_WORDS = re.compile(r"[^\W\d_]{2,}")


@lru_cache(maxsize=1024)
def _term_pattern(term: str) -> re.Pattern[str]:
    """A context term as whole words. A term that ends in punctuation, `zip:`, ends there."""
    core = term.strip()
    tail = r"(?![^\W_])" if core[-1:].isalnum() else ""
    head = r"(?<![^\W_])" if core[:1].isalnum() else ""
    return re.compile(head + re.escape(core) + tail)


def _inside_a_number(text: str, start: int, end: int) -> bool:
    """Whether a match made of digits is a piece of something longer.

    A pattern for a phone or a card number finds its digits inside a decimal, a figure with
    thousands separators or a number in scientific notation: `037 154 165 20` out of
    `3,037 154 165 20`, or the mantissa of `1.64780994e-01`. A separator with a digit on its
    other side says the number goes on. So does a slash with no space before the match: the
    tail of a DOI, `10.52202/079017-2340`, is not a phone number.
    """
    if text[start].isdigit() and start >= 2:
        before, earlier = text[start - 1], text[start - 2]
        if (before in ".," and earlier.isdigit()) or (before == "/" and earlier.isalnum()):
            return True
    last = end - 1
    return (
        text[last].isdigit()
        and end + 1 < len(text)
        and text[end] in ".,"
        and text[end + 1].isdigit()
    )


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
                if start < 0 or start == end or _inside_a_number(text, start, end):
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
                    if term is None or _inside_a_number(text, match.start(), match.end()):
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
