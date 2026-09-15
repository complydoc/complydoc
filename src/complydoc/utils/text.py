"""Small text helpers.

`plural` exists so no message has to say "3 page(s)".

`reading_similarity` is shared by the loader, which records how closely each
reader matched the kept one, and the report, which marks the differences.
"""

from __future__ import annotations

import difflib
import re

__all__ = [
    "MAX_WORDS",
    "count",
    "detect_language",
    "plural",
    "reading_similarity",
    "same_words",
    "words",
]

_WORD = re.compile(r"\S+\s*")

MAX_WORDS = 6000
"""A ceiling on a quadratic comparison.

Pages longer than this are compared only up to this length, and both callers
say so.
"""


def words(text: str) -> list[str]:
    """Words with the spacing that followed them, so joining restores the text."""
    return _WORD.findall(text)


def same_words(left: list[str], right: list[str]) -> bool:
    """Whether two readings hold the same words, whatever order they are in.

    Separates a reader that walked the page in the wrong order from one that
    read different words. Both look identical to a similarity score, and they
    call for entirely different things: the first scrambled a page it could
    read, the second could not read part of it.
    """
    return sorted(w.strip() for w in left if w.strip()) == sorted(
        w.strip() for w in right if w.strip()
    )


def reading_similarity(left: list[str], right: list[str]) -> float:
    """How closely two readings of a page agree, from 0 to 1.

    Compared in order and by word. Order, because two readers can return the
    same words in a different one — reading straight across a two-column page
    scrambles every sentence and changes no count. By word, because every
    reader breaks lines somewhere slightly different, and a measure that called
    that a difference would call every page different and be worth nothing.
    """
    bare_left = [w.strip() for w in left]
    bare_right = [w.strip() for w in right]
    if bare_left == bare_right:
        return 1.0
    if not bare_left or not bare_right:
        return 0.0
    return round(difflib.SequenceMatcher(None, bare_left, bare_right, autojunk=False).ratio(), 4)


def plural(quantity: int, singular: str, many: str | None = None) -> str:
    """The right word for the quantity, without the number."""
    if quantity == 1:
        return singular
    return many if many is not None else f"{singular}s"


def count(quantity: int, singular: str, many: str | None = None) -> str:
    """The quantity and the right word for it, e.g. "1 page" or "3 pages"."""
    return f"{quantity:,} {plural(quantity, singular, many)}"


def duration(seconds: float | None) -> str:
    """A human reading of a span, from milliseconds to days.

    Reports quote wall clock at wildly different scales — a page takes a fraction
    of a second, a backlog of scans takes days — so a single unit would be
    unreadable at one end or the other.
    """
    if seconds is None:
        return "—"
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    if seconds < 90:
        return f"{seconds:.1f}s"
    minutes = seconds / 60
    if minutes < 90:
        return f"{minutes:.0f}m"
    hours = minutes / 60
    if hours < 48:
        return f"{hours:.1f}h"
    return f"{hours / 24:.1f} days"


_MIN_LANGUAGE_LETTERS = 60
_MIN_LETTER_RATIO = 0.5


def detect_language(text: str) -> str | None:
    """The ISO 639-1 code of `text`'s language, or None when there is too little prose.

    Needs at least 60 letters making up at least half the characters; figures and
    table rules are otherwise classified as an arbitrary language.
    """
    stripped = text.strip()
    letters = sum(1 for c in stripped if c.isalpha())
    if letters < _MIN_LANGUAGE_LETTERS or letters / len(stripped) < _MIN_LETTER_RATIO:
        return None
    try:
        import py3langid

        language, _score = py3langid.classify(stripped)
    # Language detection is a hint. Any failure means no language, not a failed page.
    except Exception:
        return None
    return str(language)
