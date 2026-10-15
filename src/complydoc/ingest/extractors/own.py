"""complydoc's own reading: text through pdfium, boxes and tables through pdfplumber.

The default. No one library reads a page best. pdfium keeps the order a file stores its text
in and separates words well; pdfplumber gives a box per word and finds ruled tables, which
several readiness signals need. On two public parsing benchmarks, pdfium's text with the words
it marks as split across lines rejoined kept more of the page than any other reading of the
text layer, so that is the text this reading returns, and everything else comes from
pdfplumber.

Where pdfium cannot read the page, the text is pdfplumber's, and the page says so.
"""

from __future__ import annotations

import re
import unicodedata

from complydoc.ingest.extractors.base import Extraction, PageSource
from complydoc.ingest.extractors.plumber import PlumberExtractor
from complydoc.ingest.extractors.registry import register

_SPLIT_WORD = re.compile("[\\ufffe\\u00ad]\\s*")
"""What pdfium writes where a word is broken across two lines, and the space after it."""

_SPLIT_AT_A_HYPHEN = re.compile("[\\ufffe\\u00ad]\\s*(?=[A-Z0-9])")
"""The same, before a capital or a digit: the line broke at a hyphen the word is written with."""


def rejoined(text: str) -> str:
    """Text with words split across lines put back together, and compatibility forms folded.

    pdfium writes one mark for both a word hyphenated to fit the line and a compound that
    happened to break at its own hyphen. What follows tells them apart well enough: a word
    continues in lower case, so before a capital or a digit the hyphen is kept, and
    "Fine-Tuning" does not become "FineTuning". On two parsing benchmarks this was never
    worse than dropping every mark.

    Folding turns a ligature or a full-width digit into the plain characters a search or a
    detector looks for, which is what pdfplumber's own text assembly already does.
    """
    text = _SPLIT_AT_A_HYPHEN.sub("-", text)
    return unicodedata.normalize("NFKC", _SPLIT_WORD.sub("", text))


@register
class OwnExtractor(PlumberExtractor):
    id = "complydoc"
    name = "complydoc"
    needs_pdfium = True

    def read(self, source: PageSource, width: float, height: float) -> Extraction:
        found = super().read(source, width, height)
        if source.pdfium is None:
            found.notes.append("pdfium was not given the page, so its text is pdfplumber's")
            return found
        try:
            text = rejoined(source.pdfium.get_textpage().get_text_range() or "")
        except Exception as exc:
            found.notes.append(f"pdfium could not read the text, so it is pdfplumber's: {exc}")
            return found
        if text.strip():
            found.text = text
        return found
