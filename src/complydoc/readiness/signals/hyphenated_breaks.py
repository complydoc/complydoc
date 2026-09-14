"""Words split across a line break by a hyphen."""

from __future__ import annotations

import re

from complydoc.ingest.base import Document
from complydoc.readiness.base import ALL_FORMATS, Measurement
from complydoc.readiness.registry import signal

_SPLIT = re.compile(r"[a-z]{2,}-[ \t]*\n[ \t]*[a-z]{2,}")
"""A lowercase fragment, a hyphen at the end of the line, and a lowercase continuation."""
_WORD = re.compile(r"\w+")
_MIN_WORDS = 100


@signal
class HyphenatedBreaksSignal:
    id = "hyphenated_line_breaks"
    name = "Hyphenated line breaks"
    unit = "per 1,000 words"
    why = "Words split at line ends are indexed and embedded as two fragments."
    applies_to = ALL_FORMATS

    def measure(self, document: Document) -> Measurement:
        text = document.full_text
        word_count = len(_WORD.findall(text))
        if word_count < _MIN_WORDS:
            return Measurement.na(
                f"only {word_count} words of text were available, too few for a rate "
                f"per 1,000 words"
            )
        splits = len(_SPLIT.findall(text))
        rate = splits / word_count * 1000
        return Measurement(
            value=round(rate, 2),
            display=f"{rate:.1f} per 1,000 words",
            detail={"words_examined": word_count, "split_words": splits},
        )
