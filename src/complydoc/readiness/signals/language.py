"""Detected language per page."""

from __future__ import annotations

from collections import Counter

from complydoc.ingest.base import Document
from complydoc.readiness.base import ALL_FORMATS, Measurement
from complydoc.readiness.registry import signal
from complydoc.utils.text import detect_language

_MIN_LETTERS = 60
_MIN_LETTER_RATIO = 0.5
_MIN_PAGES = 2
_MIN_SHARE = 0.02
"""A language counts when it is the main one, or is found on this many pages, or on this
share of the pages measured. One page in a hundred called another language is the detector
guessing at a title page or a listing: on four books it named a different stray language in
each."""


@signal
class LanguageCountSignal:
    id = "language_count"
    name = "Languages detected"
    unit = "languages"
    why = "A pipeline tuned for one language handles a second one poorly."
    applies_to = ALL_FORMATS

    def measure(self, document: Document) -> Measurement:
        per_page: dict[str, str] = {}
        skipped = 0
        for page in document.pages:
            text = page.text.strip()
            letters = sum(1 for c in text if c.isalpha())
            # A page of figures and table rules gets confidently classified as some
            # improbable language, so pages without enough prose are skipped rather
            # than reported.
            if letters < _MIN_LETTERS or not text or letters / len(text) < _MIN_LETTER_RATIO:
                skipped += 1
                continue
            detected = detect_language(text)
            if detected:
                per_page[str(page.number)] = detected

        if not per_page:
            return Measurement.na(
                f"no page carried at least {_MIN_LETTERS} letters of prose that were also "
                f"at least {_MIN_LETTER_RATIO:.0%} of the page's characters, so any "
                f"language verdict would be noise"
            )

        counts = Counter(per_page.values())
        main = counts.most_common(1)[0][0]
        counted = sorted(
            language
            for language, pages in counts.items()
            if language == main or pages >= _MIN_PAGES or pages / len(per_page) >= _MIN_SHARE
        )
        return Measurement(
            value=len(counted),
            display=(
                counted[0]
                if len(counted) == 1
                else f"{len(counted)} languages: {', '.join(counted)}"
            ),
            detail={
                "per_page": per_page,
                "counts": dict(counts),
                "not_counted": sorted(set(counts) - set(counted)),
                "pages_measured": len(per_page),
                "pages_skipped_as_not_prose": skipped,
                "model": "py3langid, run locally",
            },
        )
