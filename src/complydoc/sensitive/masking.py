"""The single point at which a detected value can become readable text.

Every reported hit goes through `render`. Nothing else in complydoc turns a span
back into characters.

Masking is the default. `--reveal` is honoured only for categories not listed
under `masking.never_reveal`, and any report produced with it is stamped.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Iterable
from typing import TYPE_CHECKING

from complydoc.config.schema import MaskingConfig

if TYPE_CHECKING:  # pragma: no cover - typing only
    from complydoc.sensitive.base import SensitiveMatch

__all__ = ["carried_matches", "found_values", "mask_value", "render", "reveal_allowed"]


def reveal_allowed(category: str, config: MaskingConfig) -> bool:
    """Whether --reveal may show this category at all."""
    return category not in config.never_reveal


def mask_value(value: str, config: MaskingConfig) -> str:
    """Replace every character except the last few, keeping separators visible.

    Separators are kept because they make the shape of the identifier legible —
    a masked sort code should still look like a sort code — without disclosing
    anything about the value.
    """
    tail = max(0, config.reveal_tail_chars)
    significant = [i for i, c in enumerate(value) if c.isalnum()]

    if len(significant) <= tail:
        # Too short to show any of it without showing effectively all of it.
        keep: set[int] = set()
    else:
        keep = set(significant[-tail:]) if tail else set()

    def shown(index: int, char: str) -> str:
        if char.isalnum():
            return char if index in keep else config.mask_char
        # Separators stay so the shape remains legible, but line breaks and other
        # control characters are flattened to a space: a masked value goes into a
        # table cell and must never carry layout of its own.
        return char if char.isprintable() else " "

    return "".join(shown(i, c) for i, c in enumerate(value))


def render(
    value: str, category: str, config: MaskingConfig, reveal: bool
) -> tuple[str, str | None]:
    """Return (masked, revealed). `revealed` is None unless it is both asked for
    and permitted for this category."""
    masked = mask_value(value, config)
    if reveal and reveal_allowed(category, config):
        # Collapse whitespace so a revealed value is still a single line.
        return masked, " ".join(value.split())
    return masked, None


_SHORTEST_CARRIED = 3
"""Values shorter than this are not looked for in other text: two characters match anywhere."""


def found_values(text: str, matches: Iterable[SensitiveMatch]) -> list[tuple[str, SensitiveMatch]]:
    """Each value found in `text`, read off it at the match's place, with the match."""
    lines = text.split("\n")
    found: list[tuple[str, SensitiveMatch]] = []
    for match in matches:
        if not 0 < match.line <= len(lines):
            continue
        value = lines[match.line - 1][match.column : match.column + match.length]
        if len(value.strip()) >= _SHORTEST_CARRIED:
            found.append((value, match))
    return found


def carried_matches(text: str, found: Iterable[tuple[str, SensitiveMatch]]) -> list[SensitiveMatch]:
    """Every place in `text` that holds a value found in another reading of the same page.

    Two readers of one page read the same name, and a model may recognise it in one
    reading's wording and not the other's. The value is then an identifier complydoc
    knows about, and is covered wherever it appears, not only where it was found.
    """
    lines = text.split("\n")
    carried: list[SensitiveMatch] = []
    for value, match in found:
        for index, line in enumerate(lines):
            start = line.find(value)
            while start >= 0:
                here = dataclasses.replace(match, line=index + 1, column=start)
                carried.append(dataclasses.replace(here, length=len(value)))
                start = line.find(value, start + 1)
    return carried
