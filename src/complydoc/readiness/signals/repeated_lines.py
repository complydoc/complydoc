"""Lines repeated on most pages, such as running headers and footers."""

from __future__ import annotations

import math
import re
from collections import Counter

from complydoc.ingest.base import Document
from complydoc.readiness.base import ALL_FORMATS, Measurement
from complydoc.readiness.registry import signal

_DIGITS = re.compile(r"\d+")
_MIN_PAGES = 3
_MIN_SHARE = 0.5
"""A line counts as repeated when it appears on at least this share of pages."""
_MIN_LINE_CHARS = 3


def _key(line: str) -> str:
    """The line with whitespace collapsed and digits generalised, so "Page 3" matches "Page 4"."""
    return _DIGITS.sub("#", " ".join(line.split())).casefold()


@signal
class RepeatedLinesSignal:
    id = "repeated_page_lines"
    name = "Repeated page lines"
    unit = "% of text"
    why = "Headers and footers repeated on every page put the same text into many chunks."
    applies_to = ALL_FORMATS

    def measure(self, document: Document) -> Measurement:
        pages = [page for page in document.pages if page.text.strip()]
        if len(pages) < _MIN_PAGES:
            return Measurement.na(
                f"only {len(pages)} pages carried text; repeated lines need at least {_MIN_PAGES}"
            )

        page_lines = [
            [line for line in page.text.splitlines() if len(line.strip()) >= _MIN_LINE_CHARS]
            for page in pages
        ]
        occurrences: Counter[str] = Counter()
        for lines in page_lines:
            occurrences.update({_key(line) for line in lines})
        threshold = max(2, math.ceil(_MIN_SHARE * len(pages)))
        repeated = {key for key, seen in occurrences.items() if seen >= threshold}

        total = sum(len(" ".join(line.split())) for lines in page_lines for line in lines)
        repeated_chars = sum(
            len(" ".join(line.split()))
            for lines in page_lines
            for line in lines
            if _key(line) in repeated
        )
        share = repeated_chars / total * 100 if total else 0.0
        return Measurement(
            value=round(share, 2),
            display=f"{share:.1f}% of text",
            detail={
                "pages_examined": len(pages),
                "repeated_lines": len(repeated),
                "pages_needed_to_count_as_repeated": threshold,
            },
        )
