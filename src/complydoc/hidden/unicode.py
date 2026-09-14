"""Characters that carry text without displaying it.

- Tag characters (U+E0000 to U+E007F) mirror ASCII and render as nothing, so a
  whole sentence can sit invisibly inside a word. They are decoded.
- A long run of zero-width characters is a payload encoded in which of them
  appears where. It cannot be decoded without knowing the scheme, so only the
  run is reported.
- A bidirectional override displays the text after it in reverse, so what a
  reader sees and what a model reads are different strings.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

__all__ = ["Smuggled", "find_smuggled", "strip_invisible"]

_TAG_FIRST = 0xE0000
_ZERO_WIDTH = "​‌‍⁠﻿᠎"

_INVISIBLE = re.compile(f"[\U000e0000-\U000e007f{_ZERO_WIDTH}‪-‮⁦-⁩]")
_TAG_RUN = re.compile("[\U000e0000-\U000e007f]+")
_ZERO_WIDTH_RUN = re.compile(f"[{_ZERO_WIDTH}]+")
_OVERRIDE = re.compile("[‭‮]([^‬\n]*)")

Kind = Literal["tag_characters", "zero_width_run", "bidi_override"]


@dataclass(frozen=True, slots=True)
class Smuggled:
    kind: Kind
    start: int
    end: int
    text: str
    """What tag characters spell, or the text an override reverses. Empty for a
    zero-width run."""


def find_smuggled(text: str, zero_width_run: int = 8) -> list[Smuggled]:
    """Every run of invisible carrier characters in `text`, in order."""
    found: list[Smuggled] = []
    for match in _TAG_RUN.finditer(text):
        decoded = "".join(
            chr(ord(c) - _TAG_FIRST) for c in match.group() if 0x20 <= ord(c) - _TAG_FIRST <= 0x7E
        )
        found.append(Smuggled("tag_characters", match.start(), match.end(), decoded))
    for match in _ZERO_WIDTH_RUN.finditer(text):
        if len(match.group()) >= zero_width_run:
            found.append(Smuggled("zero_width_run", match.start(), match.end(), ""))
    for match in _OVERRIDE.finditer(text):
        if any(c.isalnum() for c in match.group(1)):
            found.append(Smuggled("bidi_override", match.start(), match.end(), match.group(1)))
    return sorted(found, key=lambda s: s.start)


def strip_invisible(text: str) -> str:
    """The text without invisible characters.

    Patterns run on this, so `ig​nore previous instructions` is still
    recognised.
    """
    return _INVISIBLE.sub("", text)
