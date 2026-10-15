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

Text outside the page's crop box and text drawn below the minimum font size are
hidden whatever the pixels show. A file can scale text down from any font size,
so a letter drawn smaller than that font's letters would be counts too.

A glyph a pixel or two tall leaves too little ink at the page's resolution to
tell from none, so small glyphs that look blank are drawn again, larger, before
they are called hidden.
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


_SMALL_GLYPH_PX = 4
"""Height in pixels below which a glyph that looks blank is drawn again, larger."""
_TALLEST_LETTER = 0.5
"""Share of a font's size its tallest letters are sure to reach.

Capitals stand about seven tenths of the size tall and the smallest letters about
half, so text whose tallest letter is under half the minimum is under the minimum.
"""
_CLOSER_SCALE = 4
"""How many times larger the second drawing is."""
_CLOSER_MAX_PIXELS = 16_000_000
"""Size one second drawing may reach."""
_CLOSER_SPLITS = 4
"""Times the glyphs are halved to keep each drawing under that size at full scale."""


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
    except (pdfium.PdfiumError, OSError) as exc:
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
            # Rendering and reading one malformed page must not stop the others.
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
        bitmap = page.render(scale=scale, grayscale=True)
        try:
            image = np.asarray(bitmap.to_pil().convert("L"))
        finally:
            with contextlib.suppress(Exception):
                bitmap.close()
        height, width = image.shape
        white = int(config.near_white * 255)
        r, g, b, a = (ctypes.c_uint() for _ in range(4))

        tallest = _tallest_letters(raw, textpage, count)
        glyphs: list[Glyph] = []
        doubtful: dict[int, tuple[float, float, float, float]] = {}
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
                reasons.append(_OUTSIDE)
                confirming = True

            text_object = raw.FPDFText_GetTextObject(textpage.raw, i)
            drawn = tallest.get(ctypes.addressof(text_object.contents)) if text_object else None
            size = raw.FPDFText_GetFontSize(textpage.raw, i)
            tiny = 0 < size < config.min_font_size_pt or (
                drawn is not None and 0 < drawn < _TALLEST_LETTER * config.min_font_size_pt
            )
            if tiny:
                reasons.append(f"font size below {config.min_font_size_pt:g}pt")
                confirming = True

            explained: list[str] = []
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
                        if (y1 - y0) * scale < _SMALL_GLYPH_PX:
                            doubtful[len(glyphs)] = (x0, y0, x1, y1)

            glyphs.append(
                Glyph(
                    char,
                    hidden=outside or tiny or blank,
                    reasons=tuple(reasons),
                    confirming=confirming,
                )
            )
        # A second drawing that fails leaves the first verdicts standing.
        with contextlib.suppress(Exception):
            for at in _drawn_after_all(page, doubtful, scale, config):
                glyphs[at] = Glyph(glyphs[at].char)
        return runs_from_chars(glyphs, number, config)
    finally:
        with contextlib.suppress(Exception):
            textpage.close()


_OUTSIDE = "outside the visible page area"


def _tallest_letters(raw: Any, textpage: Any, count: int) -> dict[int, float]:
    """The largest letter or digit drawn by each text object, in points.

    A file can set a font at 12pt and scale the text down to a hundredth of that, so
    the font's own size says little, and neither does the text's scale: some fonts
    carry their size in the glyphs. The glyph's box is what was drawn. One letter
    says little either, since an "e" is half the height of an "E", so the tallest
    in the text object stands for all of it.
    """
    tallest: dict[int, float] = {}
    for i in range(count):
        code = raw.FPDFText_GetUnicode(textpage.raw, i)
        if not (0 < code < 0x110000 and chr(code).isalnum()):
            continue
        text_object = raw.FPDFText_GetTextObject(textpage.raw, i)
        if not text_object:
            continue
        x0, y0, x1, y1 = textpage.get_charbox(i)
        key = ctypes.addressof(text_object.contents)
        tallest[key] = max(tallest.get(key, 0.0), x1 - x0, y1 - y0)
    return tallest


def _drawn_after_all(
    page: Any,
    boxes: dict[int, tuple[float, float, float, float]],
    scale: float,
    config: VisibilityConfig,
    splits: int = _CLOSER_SPLITS,
) -> list[int]:
    """The small glyphs that looked blank and show ink once drawn larger.

    Only the part of the page that holds them is drawn again, so a page of
    thumbnails does not cost a full page at the larger scale. Glyphs spread over
    more of a large page than one drawing may cover are drawn in halves.
    """
    if not boxes:
        return []
    left, bottom, right, top = page.get_cropbox()
    x0 = max(left, min(box[0] for box in boxes.values()) - 1)
    y0 = max(bottom, min(box[1] for box in boxes.values()) - 1)
    x1 = min(right, max(box[2] for box in boxes.values()) + 1)
    y1 = min(top, max(box[3] for box in boxes.values()) + 1)
    if x1 <= x0 or y1 <= y0:
        return []
    wanted = scale * _CLOSER_SCALE
    closer = min(wanted, (_CLOSER_MAX_PIXELS / ((x1 - x0) * (y1 - y0))) ** 0.5)
    if closer < wanted and splits > 0 and len(boxes) > 1:
        axis = 0 if x1 - x0 >= y1 - y0 else 1
        middle = (x0 + x1) / 2 if axis == 0 else (y0 + y1) / 2
        halves: tuple[dict[int, Any], dict[int, Any]] = ({}, {})
        for at, box in boxes.items():
            halves[(box[axis] + box[axis + 2]) / 2 >= middle][at] = box
        if halves[0] and halves[1]:
            return [
                at
                for half in halves
                for at in _drawn_after_all(page, half, scale, config, splits - 1)
            ]
    if closer <= scale:
        return []

    bitmap = page.render(
        scale=closer, grayscale=True, crop=(x0 - left, y0 - bottom, right - x1, top - y1)
    )
    try:
        image = np.asarray(bitmap.to_pil().convert("L"))
    finally:
        with contextlib.suppress(Exception):
            bitmap.close()
    height, width = image.shape
    drawn: list[int] = []
    for at, (gx0, gy0, gx1, gy1) in boxes.items():
        px0 = max(0, int((gx0 - x0) * closer))
        px1 = min(width, int(np.ceil((gx1 - x0) * closer)))
        py0 = max(0, int((y1 - gy1) * closer))
        py1 = min(height, int(np.ceil((y1 - gy0) * closer)))
        if px1 <= px0 or py1 <= py0:
            continue
        region = image[py0:py1, px0:px1]
        if int(region.max()) - int(region.min()) >= config.min_contrast:
            drawn.append(at)
    return drawn


def _overflows(glyphs: list[Glyph], start: int, reasons: list[str]) -> bool:
    """Whether a run is the end of a visible line that ran past the page's edge.

    A line set too long for its page carries on beyond the margin: the words are off the
    page, but nobody hid them. Text placed off the page on its own is another matter.
    """
    if reasons != [_OUTSIDE]:
        return False
    for glyph in reversed(glyphs[:start]):
        if glyph.newline:
            return False
        if not glyph.space:
            return not glyph.hidden
    return False


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
            reasons = [reason for reason, _ in tally.most_common()]
            runs.append(
                HiddenRun(
                    page=page,
                    text=" ".join("".join(glyph.char for glyph in members).split()),
                    visibility="confirmed" if confirmed else "suspected",
                    reasons=reasons,
                    # A line that ran off the page is layout, not hiding: worth a word only
                    # if what is off the page reads as an instruction.
                    only_if_instruction=_overflows(glyphs, start, reasons),
                )
            )
        i = end + 1
    return runs
