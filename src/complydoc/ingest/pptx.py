"""PowerPoint loader.

A PPTX is a zip of XML parts, read here with lxml, which python-docx already
depends on. Each slide is a page, in presentation order, sized as the slide.
Table cells are separated by tabs, and speaker notes follow the slide text.
Hidden slides are loaded like the others; the hidden-content check reports them.
Text inside pictures is not read.
"""

from __future__ import annotations

import posixpath
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from lxml import etree

from complydoc.ingest.base import (
    Document,
    DocumentFormat,
    ImageBlock,
    IngestOptions,
    LoaderError,
    Page,
    Rect,
    TableInfo,
    sha256_of,
)
from complydoc.ingest.registry import register

__all__ = ["Presentation", "Shape", "Slide", "read_presentation"]

_P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"
_EMU_PER_POINT = 12700
_MAX_PART_BYTES = 50 * 1024 * 1024
_FEW_CHARACTERS = 40
# No entity expansion and no fetching of external DTDs from a file's XML.
_PARSER = etree.XMLParser(resolve_entities=False, no_network=True)


@dataclass(frozen=True, slots=True)
class Shape:
    text: str
    outside: bool
    """Placed entirely outside the slide area."""
    largest_size: float | None
    """The largest font size set on the shape's text, in hundredths of a point."""


@dataclass(slots=True)
class Slide:
    number: int
    hidden: bool
    shapes: list[Shape] = field(default_factory=list)
    tables: list[TableInfo] = field(default_factory=list)
    images: list[Rect] = field(default_factory=list)
    lines: list[str] = field(default_factory=list)
    """Shape and table text in document order."""
    notes: str = ""

    @property
    def text(self) -> str:
        body = "\n".join(self.lines)
        return f"{body}\n\n{self.notes}" if self.notes else body


@dataclass(slots=True)
class Presentation:
    width_pt: float
    height_pt: float
    slides: list[Slide] = field(default_factory=list)


def _xml(archive: zipfile.ZipFile, part: str) -> Any:
    try:
        info = archive.getinfo(part)
    except KeyError as exc:
        raise LoaderError(f"the presentation has no {part} part") from exc
    if info.file_size > _MAX_PART_BYTES:
        raise LoaderError(f"{part} is larger than {_MAX_PART_BYTES // 1024 // 1024} MB")
    try:
        return etree.fromstring(archive.read(part), parser=_PARSER)
    except etree.XMLSyntaxError as exc:
        raise LoaderError(f"{part} is not valid XML ({exc})") from exc


def _relationships(archive: zipfile.ZipFile, part: str) -> dict[str, tuple[str, str]]:
    """Relationship id to (type, part path) for one part."""
    folder, name = posixpath.split(part)
    rels = posixpath.join(folder, "_rels", f"{name}.rels")
    if rels not in archive.namelist():
        return {}
    found: dict[str, tuple[str, str]] = {}
    for relationship in _xml(archive, rels).iter(f"{_REL}Relationship"):
        if relationship.get("TargetMode") == "External":
            continue
        target = relationship.get("Target", "")
        resolved = (
            target.lstrip("/")
            if target.startswith("/")
            else posixpath.normpath(posixpath.join(folder, target))
        )
        found[relationship.get("Id", "")] = (relationship.get("Type", ""), resolved)
    return found


def _emu(element: Any, attribute: str) -> int | None:
    if element is None:
        return None
    try:
        return int(element.get(attribute, ""))
    except ValueError:
        return None


def _paragraphs(body: Any) -> str:
    lines = ["".join(t.text or "" for t in p.iter(f"{_A}t")) for p in body.iter(f"{_A}p")]
    return "\n".join(line for line in lines if line.strip())


def _placement(node: Any) -> tuple[int, int, int, int] | None:
    """Offset and extent in EMU, for a shape that is not inside a group."""
    if any(ancestor.tag == f"{_P}grpSp" for ancestor in node.iterancestors()):
        # Positions inside a group are in the group's own coordinates.
        return None
    xfrm = node.find(f"{_P}spPr/{_A}xfrm")
    if xfrm is None:
        return None
    off, ext = xfrm.find(f"{_A}off"), xfrm.find(f"{_A}ext")
    values = (_emu(off, "x"), _emu(off, "y"), _emu(ext, "cx"), _emu(ext, "cy"))
    if any(value is None for value in values):
        return None
    x, y, cx, cy = (int(value or 0) for value in values)
    return x, y, cx, cy


def _table(table: Any) -> tuple[TableInfo, str]:
    rows = table.findall(f"{_A}tr")
    grid = table.find(f"{_A}tblGrid")
    cols = (
        len(grid.findall(f"{_A}gridCol"))
        if grid is not None
        else max((len(row.findall(f"{_A}tc")) for row in rows), default=0)
    )
    merged = 0
    lines: list[str] = []
    for row in rows:
        cells: list[str] = []
        for cell in row.findall(f"{_A}tc"):
            if cell.get("hMerge") in ("1", "true") or cell.get("vMerge") in ("1", "true"):
                merged += 1
                continue
            cells.append(" ".join(t.text or "" for t in cell.iter(f"{_A}t")).strip())
        if any(cells):
            lines.append("\t".join(cells))
    info = TableInfo(rows=len(rows), cols=cols, header_depth=1, merged_cells=merged)
    return info, "\n".join(lines)


def _slide(
    archive: zipfile.ZipFile, part: str, number: int, width_emu: int, height_emu: int
) -> Slide:
    root = _xml(archive, part)
    slide = Slide(number=number, hidden=root.get("show") in ("0", "false"))
    for node in root.iter(f"{_P}sp", f"{_P}graphicFrame", f"{_P}pic"):
        if node.tag == f"{_P}sp":
            body = node.find(f"{_P}txBody")
            text = _paragraphs(body) if body is not None else ""
            if not text:
                continue
            sizes = [
                float(properties.get("sz"))
                for properties in body.iter(f"{_A}rPr")
                if (properties.get("sz") or "").isdigit()
            ]
            placement = _placement(node)
            outside = False
            if placement is not None and width_emu > 0 and height_emu > 0:
                x, y, cx, cy = placement
                outside = x >= width_emu or y >= height_emu or x + cx <= 0 or y + cy <= 0
            slide.shapes.append(Shape(text, outside, max(sizes) if sizes else None))
            slide.lines.append(text)
        elif node.tag == f"{_P}graphicFrame":
            table = node.find(f".//{_A}tbl")
            if table is None:
                continue
            info, text = _table(table)
            slide.tables.append(info)
            if text:
                slide.lines.append(text)
        else:
            placement = _placement(node)
            if placement is not None:
                left, top, width, height = (value / _EMU_PER_POINT for value in placement)
                slide.images.append(Rect(left, top, left + width, top + height))

    for kind, notes_part in _relationships(archive, part).values():
        if not kind.endswith("/notesSlide"):
            continue
        notes: list[str] = []
        for shape in _xml(archive, notes_part).iter(f"{_P}sp"):
            placeholder = shape.find(f"{_P}nvSpPr/{_P}nvPr/{_P}ph")
            body = shape.find(f"{_P}txBody")
            if placeholder is not None and placeholder.get("type") == "body" and body is not None:
                notes.append(_paragraphs(body))
        slide.notes = "\n".join(text for text in notes if text)
    return slide


def read_presentation(path: Path) -> Presentation:
    """Every slide's text, tables, pictures and notes, in presentation order."""
    try:
        archive = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError) as exc:
        raise LoaderError(
            "not a readable PowerPoint file; it may be encrypted or in the older .ppt format"
        ) from exc
    with archive:
        root = _xml(archive, "ppt/presentation.xml")
        size = root.find(f"{_P}sldSz")
        width_emu, height_emu = _emu(size, "cx") or 0, _emu(size, "cy") or 0
        presentation = Presentation(width_emu / _EMU_PER_POINT, height_emu / _EMU_PER_POINT)
        relationships = _relationships(archive, "ppt/presentation.xml")
        slide_ids = root.find(f"{_P}sldIdLst")
        for slide_id in slide_ids.iter(f"{_P}sldId") if slide_ids is not None else ():
            _kind, part = relationships.get(slide_id.get(f"{_R}id", ""), ("", ""))
            if part:
                number = len(presentation.slides) + 1
                presentation.slides.append(_slide(archive, part, number, width_emu, height_emu))
    return presentation


class PptxLoader:
    extensions: tuple[str, ...] = (".pptx",)
    format: DocumentFormat = DocumentFormat.PPTX

    def load(self, path: Path, options: IngestOptions) -> Document:
        presentation = read_presentation(path)
        document = Document(path=path, sha256=sha256_of(path), format=self.format)
        pictures_only: list[int] = []
        for slide in presentation.slides:
            page = Page(
                number=slide.number,
                width_pt=presentation.width_pt,
                height_pt=presentation.height_pt,
                text=slide.text,
            )
            page.text_source = "native" if page.text.strip() else "none"
            page.tables = slide.tables
            page.image_blocks = [ImageBlock(bbox=rect) for rect in slide.images]
            if slide.notes:
                page.notes.append("Speaker notes are included after the slide text.")
            if slide.hidden:
                page.notes.append("This slide is hidden in the presentation.")
            if slide.images and len(page.text.strip()) < _FEW_CHARACTERS:
                pictures_only.append(slide.number)
            document.pages.append(page)
        if not presentation.slides:
            document.load_warnings.append("The presentation has no slides.")
        if pictures_only:
            listed = ", ".join(str(n) for n in pictures_only)
            document.load_warnings.append(
                f"Slides {listed} hold pictures and little text. Text inside pictures is not read."
            )
        return document


register(PptxLoader())
