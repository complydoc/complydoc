"""Glyph codes and private-use characters left in extracted text."""

from __future__ import annotations

import re

from complydoc.ingest.base import Document
from complydoc.readiness.base import ALL_FORMATS, Measurement
from complydoc.readiness.registry import signal

_CID = re.compile(r"\(cid:\d+\)")
_PRIVATE_USE = re.compile("[-]")
_CONTROL = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")
_MIN_CHARS = 200


@signal
class UnmappedGlyphsSignal:
    id = "unmapped_glyphs"
    name = "Unmapped glyphs"
    unit = "per 1,000 characters"
    why = "Glyph codes and private-use characters are text that was not mapped to letters."
    applies_to = ALL_FORMATS

    def measure(self, document: Document) -> Measurement:
        text = document.full_text
        if len(text) < _MIN_CHARS:
            return Measurement.na(
                f"only {len(text)} characters of text were available, too few for a rate "
                f"per 1,000 characters"
            )
        cid_codes = len(_CID.findall(text))
        private_use = len(_PRIVATE_USE.findall(text))
        control = len(_CONTROL.findall(text))
        rate = (cid_codes + private_use + control) / len(text) * 1000
        return Measurement(
            value=round(rate, 2),
            display=f"{rate:.1f} per 1,000 chars",
            detail={
                "characters_examined": len(text),
                "cid_codes": cid_codes,
                "private_use_characters": private_use,
                "control_characters": control,
            },
        )
