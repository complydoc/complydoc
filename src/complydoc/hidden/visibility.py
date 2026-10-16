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
so a letter drawn smaller than that font's letters would be counts too. A font
size of zero is below the minimum as well. The text page omits it, so the words
are read from the page content instead.

An image painted over a glyph may hide it when the image is opaque there. The
page render cannot say so: a photograph or a gradient has contrast, and that
looks like ink. The image's own pixels are what decide, masks included. An image
behind the text does not count, and neither does one that is transparent or
that leaves part of the glyph outside it. Such text is suspected, not confirmed,
and reported only when it reads as an instruction to a model: a figure painted
over its own labels looks the same, and is common. Invisible text is left out
of this, and so is an image over half the page or more: that is a scan's picture
painted over its own text layer.

A glyph a pixel or two tall leaves too little ink at the page's resolution to
tell from none, so small glyphs that look blank are drawn again, larger, before
they are called hidden.
"""

from __future__ import annotations

import contextlib
import ctypes
import functools
import math
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from complydoc.config.schema import VisibilityConfig

__all__ = ["HiddenRun", "pdf_hidden_runs", "runs_from_chars"]

_INVISIBLE_MODES = {3: "invisible text render mode", 7: "clip-only text render mode"}
_BLANK = "nothing is drawn where the text layer has this text"
_COVERED = "covered by an opaque image"
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
_OBJECT_DEPTH = 8
"""How far into nested form objects the page is walked for images and zero-size text."""
_COVER_SLOP = 0.6
"""Points a glyph box may pass an image edge and still count as inside it.

A character's box includes a little of the side bearing. The ink is covered
when the box overshoots the picture by less than this.
"""
_POSITION_SLOP = 2.0
"""Points within which a content-stream string is the text object that was skipped."""
_OPAQUE_ALPHA = 250
"""Alpha, out of 255, at or above which an image pixel counts as opaque."""
_OPAQUE_SHARE = 0.98
"""Share of the glyph's footprint that must be opaque before the image hides it."""
_SCAN_SHARE = 0.5
"""Share of the page an image may cover and still be a cover; past it, it is a scan's picture."""
_MAX_IMAGE_PIXELS = 16_000_000
"""Display size past which an image's opacity is left unread, and the text not called covered."""


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
                runs.extend(_page_runs(page, index + 1, config, path, password))
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


def _page_runs(
    page: Any, number: int, config: VisibilityConfig, path: Path, password: str
) -> list[HiddenRun]:
    import pypdfium2.raw as raw

    textpage = page.get_textpage()
    try:
        count = textpage.count_chars()
        covers, text_order, skipped = _page_objects(page, raw, textpage, count, config)
        missed = _runs_pdfium_skipped(skipped, path, number, password, config)
        if count <= 0:
            return missed
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
            # A failed read is also 0. Only a size the text object itself reports
            # as zero is a font size of zero; the other zero is left alone.
            object_size = _object_font_size(raw, text_object)
            tiny = (
                0 < size < config.min_font_size_pt
                or (drawn is not None and 0 < drawn < _TALLEST_LETTER * config.min_font_size_pt)
                or (object_size == 0)
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
            covered = False
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
                # Invisible text is reported only when the page is blank under it.
                # On a scan the OCR layer is invisible and the picture may be
                # painted after it, so the image is not what decides.
                order = text_order.get(_handle(text_object)) if text_object else None
                if (
                    mode not in _INVISIBLE_MODES
                    and order is not None
                    and _under_opaque_image(covers, order, (x0, y0, x1, y1))
                ):
                    # Suspected, not confirmed: a figure painted over its own labels, or a
                    # picture of the very words under it, looks the same as a cover.
                    reasons.append(_COVERED)
                    covered = True
                elif blank and not tiny:
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
                    hidden=outside or tiny or blank or covered,
                    reasons=tuple(reasons),
                    confirming=confirming,
                )
            )
        # A second drawing that fails leaves the first verdicts standing.
        with contextlib.suppress(Exception):
            for at in _drawn_after_all(page, doubtful, scale, config):
                glyphs[at] = Glyph(glyphs[at].char)
        return runs_from_chars(glyphs, number, config) + missed
    finally:
        with contextlib.suppress(Exception):
            textpage.close()


_OUTSIDE = "outside the visible page area"


def _handle(obj: Any) -> int:
    """Identity of a pdfium page object, whether it came from the text page or the object list."""
    raw_obj = getattr(obj, "raw", obj)
    if isinstance(raw_obj, int):
        return raw_obj
    pointer = ctypes.cast(raw_obj, ctypes.c_void_p)
    return int(pointer.value or 0)


def _object_font_size(raw: Any, text_object: Any) -> float | None:
    """Font size stored on the text object, or None when it cannot be read.

    `FPDFText_GetFontSize` returns 0 both for a font set at 0pt and for a character
    it could not read. The object call says which of the two it is.
    """
    if not text_object:
        return None
    measured = ctypes.c_float()
    if not raw.FPDFTextObj_GetFontSize(text_object, ctypes.byref(measured)):
        return None
    return float(measured.value)


@dataclass
class _ImageCover:
    """An image, in paint order, and the rectangle of it a reader can see."""

    order: int
    bounds: tuple[float, float, float, float]
    image: Any
    _alpha: np.ndarray | None = field(default=None, repr=False)
    _alpha_known: bool = field(default=False, repr=False)

    def opaque_over(self, glyph: tuple[float, float, float, float]) -> bool:
        """Whether this image hides `glyph`: the box is inside it, and those pixels are opaque."""
        if not _contains(self.bounds, glyph):
            return False
        alpha = self._opacity()
        if alpha is None:
            return False
        return _footprint_opaque(alpha, self.bounds, glyph)

    def _opacity(self) -> np.ndarray | None:
        """Alpha of the image as it is painted, or None when that cannot be read.

        Rendering applies a soft mask and a constant transparency. The page render
        does not: there the picture's colours are what the pixels show. A copy is
        kept, because the bitmap's buffer dies with it.
        """
        if self._alpha_known:
            return self._alpha
        self._alpha_known = True
        width = self.bounds[2] - self.bounds[0]
        height = self.bounds[3] - self.bounds[1]
        if width <= 0 or height <= 0 or width * height > _MAX_IMAGE_PIXELS:
            return None
        try:
            bitmap = self.image.get_bitmap(render=True, scale_to_original=False)
        except Exception:
            return None
        try:
            array = np.array(bitmap.to_numpy(), copy=True)
        finally:
            with contextlib.suppress(Exception):
                bitmap.close()
        if array.ndim == 3 and array.shape[2] == 4:
            self._alpha = array[:, :, 3]
        elif array.ndim == 2 or (array.ndim == 3 and array.shape[2] in (1, 3)):
            self._alpha = np.full(array.shape[:2], 255, dtype=np.uint8)
        return self._alpha


def _page_objects(
    page: Any, raw: Any, textpage: Any, count: int, config: VisibilityConfig
) -> tuple[list[_ImageCover], dict[int, int], list[tuple[float, float]]]:
    """Images that might cover text, each text object's paint order, and text the text page dropped.

    Paint order is the order objects are drawn, including inside forms. An image
    counts only when it comes after the text. pdfium's text page drops a text
    object whose drawn size is zero, so a sentence at 0pt is not among `count`.
    """
    seen: set[int] = set()
    for index in range(count):
        obj = raw.FPDFText_GetTextObject(textpage.raw, index)
        if obj:
            seen.add(_handle(obj))

    left, bottom, right, top = page.get_cropbox()
    page_area = max((right - left) * (top - bottom), 1.0)
    covers: list[_ImageCover] = []
    text_order: dict[int, int] = {}
    skipped: list[tuple[float, float]] = []
    order = 0
    for obj in page.get_objects(max_depth=_OBJECT_DEPTH):
        order += 1
        if obj.type == raw.FPDF_PAGEOBJ_TEXT:
            key = _handle(obj)
            text_order[key] = order
            if key in seen:
                continue
            placed = _skipped_origin(obj, config)
            if placed is not None:
                skipped.append(placed)
        elif obj.type == raw.FPDF_PAGEOBJ_IMAGE:
            bounds = _visible_image_bounds(raw, obj)
            if bounds is not None:
                # An image over most of the page is a scan's picture of the page, painted
                # over its own text layer: that text is what the picture shows.
                x0, y0, x1, y1 = bounds
                if (x1 - x0) * (y1 - y0) < _SCAN_SHARE * page_area:
                    covers.append(_ImageCover(order, bounds, obj))
    return covers, text_order, skipped


def _skipped_origin(obj: Any, config: VisibilityConfig) -> tuple[float, float] | None:
    """Where a text object the text page left out was drawn, when it is below the minimum size."""
    try:
        size = float(obj.get_font_size())
        left, bottom, _right, _top = obj.get_bounds()
        a, b, c, d, _e, _f = obj.get_matrix().get()
    except Exception:
        return None
    # The size the text is drawn at: its font size times the object's own scale. Its
    # box says nothing here, since an empty text object, which many PDFs carry on
    # every page, has an empty box too, and reading the page again for each of those
    # cost more than the rest of the check.
    drawn = size * max(math.hypot(a, b), math.hypot(c, d))
    if drawn >= config.min_font_size_pt:
        return None
    return (float(left), float(bottom))


def _visible_image_bounds(raw: Any, obj: Any) -> tuple[float, float, float, float] | None:
    """The image's box on the page, cut down by a rectangular clip, if it has one.

    A clip pdfium cannot describe is refused: the image's full box would then
    cover text the clip keeps visible.
    """
    try:
        left, bottom, right, top = (float(value) for value in obj.get_bounds())
    except Exception:
        return None
    if right <= left or top <= bottom:
        return None
    # An image often carries an empty clip handle. That is not a clip: only a
    # path pdfium can count reduces the box. One it cannot describe is refused,
    # so the full box is not taken to cover text the clip keeps visible.
    clip = raw.FPDFPageObj_GetClipPath(obj.raw)
    if not clip:
        return (left, bottom, right, top)
    try:
        paths = int(raw.FPDFClipPath_CountPaths(clip))
    except Exception:
        return (left, bottom, right, top)
    if paths <= 0:
        return (left, bottom, right, top)
    clipped = _clip_box(raw, clip, paths)
    if clipped is None:
        return None
    left, bottom = max(left, clipped[0]), max(bottom, clipped[1])
    right, top = min(right, clipped[2]), min(top, clipped[3])
    if right <= left or top <= bottom:
        return None
    return (left, bottom, right, top)


def _clip_box(raw: Any, clip: Any, paths: int) -> tuple[float, float, float, float] | None:
    """Bounding box of a clip built from straight lines, or None when a curve makes that a guess."""
    xs: list[float] = []
    ys: list[float] = []
    for path_index in range(paths):
        try:
            segments = int(raw.FPDFClipPath_CountPathSegments(clip, path_index))
        except Exception:
            return None
        for segment_index in range(segments):
            segment = raw.FPDFClipPath_GetPathSegment(clip, path_index, segment_index)
            if not segment:
                return None
            if int(raw.FPDFPathSegment_GetType(segment)) == int(raw.FPDF_SEGMENT_BEZIERTO):
                return None
            x, y = ctypes.c_float(), ctypes.c_float()
            if not raw.FPDFPathSegment_GetPoint(segment, x, y):
                return None
            xs.append(float(x.value))
            ys.append(float(y.value))
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def _contains(
    bounds: tuple[float, float, float, float], glyph: tuple[float, float, float, float]
) -> bool:
    """Whether `glyph` sits inside `bounds`, allowing `_COVER_SLOP` of bearing."""
    left, bottom, right, top = bounds
    x0, y0, x1, y1 = glyph
    if x1 <= x0 or y1 <= y0:
        return False
    return (
        x0 >= left - _COVER_SLOP
        and x1 <= right + _COVER_SLOP
        and y0 >= bottom - _COVER_SLOP
        and y1 <= top + _COVER_SLOP
    )


def _under_opaque_image(
    covers: list[_ImageCover], order: int, glyph: tuple[float, float, float, float]
) -> bool:
    """Whether an image painted after the text object at `order` hides this glyph."""
    return any(cover.order > order and cover.opaque_over(glyph) for cover in covers)


def _footprint_opaque(
    alpha: np.ndarray,
    bounds: tuple[float, float, float, float],
    glyph: tuple[float, float, float, float],
) -> bool:
    """Whether the image is opaque over `glyph`.

    Row 0 of the bitmap is the top of the image. A one-pixel fringe is left out
    of the sample: renderers leave it transparent on an image that is opaque.
    """
    sampled = _sample(alpha, bounds, glyph, inset=True)
    if sampled is None:
        sampled = _sample(alpha, bounds, glyph, inset=False)
    if sampled is None or sampled.size == 0:
        return False
    return float(np.mean(sampled >= _OPAQUE_ALPHA)) >= _OPAQUE_SHARE


def _sample(
    alpha: np.ndarray,
    bounds: tuple[float, float, float, float],
    glyph: tuple[float, float, float, float],
    *,
    inset: bool,
) -> np.ndarray | None:
    left, bottom, right, top = bounds
    x0, y0, x1, y1 = glyph
    height, width = alpha.shape
    if right <= left or top <= bottom or width <= 0 or height <= 0:
        return None
    px0 = math.floor((x0 - left) / (right - left) * width)
    px1 = math.ceil((x1 - left) / (right - left) * width)
    # Bitmap row 0 is the top of the image, which is the greater page y.
    py0 = math.floor((top - y1) / (top - bottom) * height)
    py1 = math.ceil((top - y0) / (top - bottom) * height)
    if inset and height > 2 and width > 2:
        px0, px1 = max(px0, 1), min(px1, width - 1)
        py0, py1 = max(py0, 1), min(py1, height - 1)
    else:
        px0, px1 = max(px0, 0), min(px1, width)
        py0, py1 = max(py0, 0), min(py1, height)
    if px1 <= px0 or py1 <= py0:
        return None
    return alpha[py0:py1, px0:px1]


def _runs_pdfium_skipped(
    skipped: list[tuple[float, float]],
    path: Path,
    number: int,
    password: str,
    config: VisibilityConfig,
) -> list[HiddenRun]:
    """Passages at the positions pdfium's text page dropped, read from the content stream.

    Each skipped text object is only a point. The words are on the page content,
    at that point, in a font smaller than the minimum. One passage per object, so
    two such sentences stay two findings.
    """
    if not skipped:
        return []
    segments = _tiny_segments(path, number, password, config)
    if not segments:
        return []
    reason = f"font size below {config.min_font_size_pt:g}pt"
    used: set[int] = set()
    runs: list[HiddenRun] = []
    for origin_x, origin_y in skipped:
        parts: list[str] = []
        for index, (x, y, text) in enumerate(segments):
            if index in used:
                continue
            if abs(x - origin_x) <= _POSITION_SLOP and abs(y - origin_y) <= _POSITION_SLOP:
                parts.append(text)
                used.add(index)
        runs.extend(runs_from_chars(_hidden_glyphs("".join(parts), reason), number, config))
    return runs


def _hidden_glyphs(text: str, reason: str) -> list[Glyph]:
    glyphs: list[Glyph] = []
    for char in text:
        if char.isspace() or not char.isprintable():
            glyphs.append(Glyph(" ", space=True, newline=char in "\r\n"))
        else:
            glyphs.append(Glyph(char, hidden=True, reasons=(reason,), confirming=True))
    return glyphs


@functools.lru_cache(maxsize=2)
def _pypdf_reader(path: str, password: str, modified: int) -> Any:
    """The file opened once for every page that needs it, not once a page.

    `modified` keys the cache, so a file changed on disk is read again.
    """
    import pypdf

    reader = pypdf.PdfReader(path)
    if reader.is_encrypted:
        reader.decrypt(password or "")
    return reader


def _tiny_segments(
    path: Path, number: int, password: str, config: VisibilityConfig
) -> list[tuple[float, float, str]]:
    """Strings drawn below the minimum font size, with the point they are placed at.

    This is the text the text page does not carry. Anything large enough to be in
    the text page is left out, so it is not reported twice.
    """
    try:
        content = _pypdf_reader(str(path), password, path.stat().st_mtime_ns).pages[number - 1]
    except Exception:
        return []

    found: list[tuple[float, float, str]] = []

    def visit(text: Any, cm: Any, tm: Any, font: Any, font_size: Any) -> None:
        try:
            size, x, y = _placed(float(font_size), cm, tm)
        except (TypeError, ValueError):
            return
        if size >= config.min_font_size_pt or not text:
            return
        found.append((x, y, str(text)))

    try:
        content.extract_text(visitor_text=visit)
    except Exception:
        return []
    return found


def _placed(font_size: float, cm: Any, tm: Any) -> tuple[float, float, float]:
    """Effective font size and origin once the text and current matrices are applied."""

    def row(matrix: Any) -> tuple[float, float, float, float, float, float]:
        a, b, c, d, e, f = (float(value) for value in matrix)
        return a, b, c, d, e, f

    a1, b1, c1, d1, e1, f1 = row(cm)
    a2, b2, c2, d2, e2, f2 = row(tm)
    a = a1 * a2 + c1 * b2
    b = b1 * a2 + d1 * b2
    c = a1 * c2 + c1 * d2
    d = b1 * c2 + d1 * d2
    e = a1 * e2 + c1 * f2 + e1
    f = b1 * e2 + d1 * f2 + f1
    scale = max(math.hypot(a, b), math.hypot(c, d))
    return font_size * scale, e, f


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
                    # A line that ran off the page is layout, not hiding, and text under a
                    # picture is most often a figure's own labels under the figure: each is
                    # worth a word only if it reads as an instruction.
                    only_if_instruction=_overflows(glyphs, start, reasons) or reasons == [_COVERED],
                )
            )
        i = end + 1
    return runs
