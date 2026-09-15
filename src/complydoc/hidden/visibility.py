"""Which characters in a PDF's text layer a reader would not see.

The page is drawn, and each character in the text layer is checked for ink
under its box. Where the pixels are uniform, nothing visible is drawn there:
the text is in the background colour, under a filled shape, clipped away, in a
hidden layer, or in an invisible render mode.

The pixels decide whether text is hidden; the file explains why. Invisible
render mode is normal on a scanned page, where it sits over the picture of the
same words. There is ink under it there, so it is not reported. A reason read
from the file raises a passage from suspected to confirmed only once the page
shows nothing where it is.

Text outside the page's crop box and text below the minimum font size are
hidden whatever the pixels show.
"""

from __future__ import annotations

import contextlib
import ctypes
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from complydoc.config.schema import VisibilityConfig

__all__ = ["HiddenRun", "pdf_hidden_runs", "runs_from_chars"]

_INVISIBLE_MODES = {3: "invisible text render mode", 7: "clip-only text render mode"}
_BLANK = "nothing is drawn where the text layer has this text"
_MAX_VISIBLE_GAP = 2
"""Visible glyphs a hidden passage may contain before it is split in two.

Anti-aliasing from a neighbouring line can leave a few pixels under a hidden
glyph. Splitting on each of those would report one sentence as several.
"""


@dataclass(frozen=True, slots=True)
class HiddenRun:
    """A passage of hidden text."""

    page: int | None
    text: str
    visibility: str
    """`suspected` or `confirmed`."""
    reasons: list[str] = field(default_factory=list)
    only_if_instruction: bool = False
    """Hidden the way web pages routinely hide menus, dialogs and comments, so it is
    reported only when it reads as an instruction."""


@dataclass(frozen=True, slots=True)
class Glyph:
    char: str
    hidden: bool = False
    reasons: tuple[str, ...] = ()
    confirming: bool = False
    space: bool = False
    newline: bool = False


def pdf_hidden_runs(
    path: Path, config: VisibilityConfig, password: str = ""
) -> tuple[list[HiddenRun], list[str], set[int], bool]:
    """Hidden passages, notes, pages not checked, and whether the file could be read."""
    import pypdfium2 as pdfium

    try:
        pdf = pdfium.PdfDocument(str(path), password=password or None)
    except Exception as exc:
        return [], [f"the file could not be opened to check for hidden text ({exc})"], set(), False

    runs: list[HiddenRun] = []
    notes: list[str] = []
    unchecked: set[int] = set()
    try:
        total = len(pdf)
        if total > config.max_pages:
            notes.append(f"pages after {config.max_pages} were not checked for hidden text")
            unchecked.update(range(config.max_pages + 1, total + 1))
        rotated: list[int] = []
        for index in range(min(total, config.max_pages)):
            page = pdf[index]
            try:
                if page.get_rotation() % 360:
                    rotated.append(index + 1)
                    continue
                runs.extend(_page_runs(page, index + 1, config))
            except Exception as exc:
                notes.append(f"page {index + 1} could not be checked for hidden text ({exc})")
                unchecked.add(index + 1)
            finally:
                with contextlib.suppress(Exception):
                    page.close()
        if rotated:
            notes.append(
                "rotated pages were not checked for hidden text: " + ", ".join(map(str, rotated))
            )
            unchecked.update(rotated)
    finally:
        with contextlib.suppress(Exception):
            pdf.close()
    return runs, notes, unchecked, True


def _page_runs(page: Any, number: int, config: VisibilityConfig) -> list[HiddenRun]:
    import pypdfium2.raw as raw

    textpage = page.get_textpage()
    try:
        count = textpage.count_chars()
        if count <= 0:
            return []
        left, bottom, right, top = page.get_cropbox()
        scale = config.render_dpi / 72.0
        image = np.asarray(page.render(scale=scale, grayscale=True).to_pil().convert("L"))
        height, width = image.shape
        white = int(config.near_white * 255)
        r, g, b, a = (ctypes.c_uint() for _ in range(4))

        glyphs: list[Glyph] = []
        for i in range(count):
            code = raw.FPDFText_GetUnicode(textpage.raw, i)
            char = chr(code) if 0 < code < 0x110000 and code != 0xFFFE else " "
            if char.isspace() or not char.isprintable():
                glyphs.append(Glyph(" ", space=True, newline=char in "\r\n"))
                continue

            x0, y0, x1, y1 = textpage.get_charbox(i)
            reasons: list[str] = []
            confirming = False

            outside = x1 <= left or x0 >= right or y1 <= bottom or y0 >= top
            if outside:
                reasons.append("outside the visible page area")
                confirming = True

            size = raw.FPDFText_GetFontSize(textpage.raw, i)
            tiny = 0 < size < config.min_font_size_pt
            if tiny:
                reasons.append(f"font size below {config.min_font_size_pt:g}pt")
                confirming = True

            explained: list[str] = []
            text_object = raw.FPDFText_GetTextObject(textpage.raw, i)
            mode = raw.FPDFTextObj_GetTextRenderMode(text_object) if text_object else -1
            if mode in _INVISIBLE_MODES:
                explained.append(_INVISIBLE_MODES[mode])
            if raw.FPDFText_GetFillColor(
                textpage.raw, i, ctypes.byref(r), ctypes.byref(g), ctypes.byref(b), ctypes.byref(a)
            ):
                if a.value == 0:
                    explained.append("fully transparent text")
                elif min(r.value, g.value, b.value) >= white:
                    explained.append("white text")

            blank = False
            if not outside:
                px0 = max(0, int((x0 - left) * scale))
                px1 = min(width, int(np.ceil((x1 - left) * scale)))
                py0 = max(0, int((top - y1) * scale))
                py1 = min(height, int(np.ceil((top - y0) * scale)))
                if px1 <= px0 or py1 <= py0:
                    blank = True
                else:
                    region = image[py0:py1, px0:px1]
                    blank = int(region.max()) - int(region.min()) < config.min_contrast
                if blank and not tiny:
                    if explained:
                        reasons.extend(explained)
                        confirming = True
                    else:
                        reasons.append(_BLANK)

            glyphs.append(
                Glyph(
                    char,
                    hidden=outside or tiny or blank,
                    reasons=tuple(reasons),
                    confirming=confirming,
                )
            )
        return runs_from_chars(glyphs, number, config)
    finally:
        with contextlib.suppress(Exception):
            textpage.close()


def runs_from_chars(
    glyphs: list[Glyph], page: int | None, config: VisibilityConfig
) -> list[HiddenRun]:
    """Group consecutive hidden glyphs into passages worth reporting.

    A passage ends at a line break where the reason for hiding changes, so white
    text on one line and invisible text on the next are two findings, each with
    its own reason.
    """
    runs: list[HiddenRun] = []
    i, n = 0, len(glyphs)
    while i < n:
        if glyphs[i].space or not glyphs[i].hidden:
            i += 1
            continue
        start = end = i
        gap = 0
        j = i
        crossed = False
        while j < n:
            glyph = glyphs[j]
            if glyph.space:
                crossed = crossed or glyph.newline
                j += 1
                continue
            if glyph.hidden:
                if crossed and glyph.reasons != glyphs[end].reasons:
                    break
                end, gap, crossed = j, 0, False
            else:
                gap += 1
                if gap > _MAX_VISIBLE_GAP:
                    break
            j += 1

        members = glyphs[start : end + 1]
        shown = [glyph for glyph in members if not glyph.space]
        hidden = [glyph for glyph in shown if glyph.hidden]
        letters = sum(glyph.char.isalnum() for glyph in hidden)
        if letters >= config.min_characters and len(hidden) >= config.min_hidden_share * len(shown):
            tally = Counter(reason for glyph in hidden for reason in glyph.reasons)
            confirmed = sum(1 for glyph in hidden if glyph.confirming) * 2 >= len(hidden)
            runs.append(
                HiddenRun(
                    page=page,
                    text=" ".join("".join(glyph.char for glyph in members).split()),
                    visibility="confirmed" if confirmed else "suspected",
                    reasons=[reason for reason, _ in tally.most_common()],
                )
            )
        i = end + 1
    return runs
