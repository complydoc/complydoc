"""Safe copies of Office files: masked text, and the metadata taken out.

An Office file is a zip of XML parts. The text lives in runs, cells and shape
text, and each of those is masked on its own. The metadata is a separate part
that no reader of the document sees, which is why a copy that masks the body and
keeps `docProps` has not done the job: the author, the company and the title
travel with the file.
"""

from __future__ import annotations

import posixpath
import zipfile
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from complydoc.cleaning import CleanChange, CleanResult
from complydoc.config.schema import Config
from complydoc.extraction.extract import mask_matches
from complydoc.sensitive.scanner import scan_text

__all__ = ["clean_office_file"]

_SPLIT_NOTE = (
    "Each run, cell and shape was masked on its own, so an identifier split "
    "across two of them was not seen as one value."
)
_CORE_PROPERTIES = (
    "author",
    "category",
    "comments",
    "content_status",
    "identifier",
    "keywords",
    "language",
    "last_modified_by",
    "subject",
    "title",
    "version",
)


def _mask(
    text: str, settings: Config, where: str = "", into: list[CleanChange] | None = None
) -> tuple[str, int, int, dict[str, str]]:
    """As in `formats`: the masked text, the counts, and what could not be scanned.

    With `into`, each identifier covered over is recorded there, in terms of the
    part of the document it sat in. Only the masked form is kept.
    """
    if not text.strip():
        return text, 0, 0, {}
    matches, unavailable = scan_text(text, settings.sensitive)
    masked, replaced, confirmed = mask_matches(text, matches)
    if into is not None:
        into.extend(
            CleanChange(
                category=match.category,
                label=match.label,
                masked=match.masked,
                where=where or "text",
            )
            for match in matches
        )
    return masked, replaced, confirmed, unavailable


def clean_office_file(
    source: Path, target: Path, format_name: str, settings: Config
) -> CleanResult:
    result = CleanResult(source=source, format=format_name)
    result.notes.append(_SPLIT_NOTE)
    try:
        if format_name == "docx":
            _clean_docx(source, target, settings, result)
        elif format_name == "xlsx":
            _clean_xlsx(source, target, settings, result)
        else:
            _clean_pptx(source, target, settings, result)
    except Exception as exc:
        result.output = None
        result.skipped = f"the file could not be rewritten ({type(exc).__name__}: {exc})"
        target.unlink(missing_ok=True)
    return result


def _clear_core_properties(properties: object, removed: list[str]) -> None:
    """Blank every core property that carries a value."""
    for name in _CORE_PROPERTIES:
        if not hasattr(properties, name):
            continue
        try:
            value = getattr(properties, name)
        except (AttributeError, ValueError):
            continue
        if value in (None, ""):
            continue
        try:
            setattr(properties, name, "")
        except (AttributeError, ValueError, TypeError):
            continue
        removed.append(f"docProps {name}")


def _clean_docx(source: Path, target: Path, settings: Config, result: CleanResult) -> None:
    import docx
    from docx.opc.constants import RELATIONSHIP_TYPE as RT

    document = docx.Document(str(source))

    def mask_paragraphs(paragraphs: Iterable[Any], area: str = "paragraph") -> None:
        for index, paragraph in enumerate(paragraphs, start=1):
            for run in paragraph.runs:
                place = f"{area} {index}"
                masked, count, sure, missing = _mask(run.text, settings, place, result.changes)
                if count:
                    run.text = masked
                result.masked += count
                result.masked_confirmed += sure
                result.unscanned_categories.update(missing)

    mask_paragraphs(document.paragraphs)
    for number, table in enumerate(document.tables, start=1):
        for row in table.rows:
            for cell in row.cells:
                mask_paragraphs(cell.paragraphs, f"table {number}")
    for section in document.sections:
        for name, area in (("header", section.header), ("footer", section.footer)):
            mask_paragraphs(area.paragraphs, name)

    _clear_core_properties(document.core_properties, result.metadata_removed)

    package = document.part.package
    thumbnails = [rid for rid, rel in package.rels.items() if rel.reltype == RT.THUMBNAIL]
    for rid in thumbnails:
        # The part and its relationship go together; dropping the part alone
        # leaves a reference to something that is no longer in the package.
        del package.rels[rid]
    if thumbnails:
        result.metadata_removed.append("docProps thumbnail")

    document.save(str(target))
    result.output = target


def _clean_xlsx(source: Path, target: Path, settings: Config, result: CleanResult) -> None:
    import openpyxl

    workbook = openpyxl.load_workbook(str(source))
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                if not isinstance(cell.value, str):
                    continue
                place = f"{sheet.title}!{cell.coordinate}"
                masked, count, sure, missing = _mask(cell.value, settings, place, result.changes)
                if count:
                    cell.value = masked
                result.masked += count
                result.masked_confirmed += sure
                result.unscanned_categories.update(missing)

    _clear_core_properties(workbook.properties, result.metadata_removed)
    workbook.save(str(target))
    result.output = target


_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_CORE_PART = "docProps/core.xml"
_APP_PART = "docProps/app.xml"


def _clean_pptx(source: Path, target: Path, settings: Config, result: CleanResult) -> None:
    """Rewrite the text nodes of every slide part, and drop the metadata parts.

    The presentation loader reads the XML directly rather than through
    python-pptx, which complydoc does not depend on at runtime, so the copy is
    written the same way.
    """
    from lxml import etree

    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    dropped: list[str] = []

    with zipfile.ZipFile(source) as archive:
        items = archive.infolist()
        contents: dict[str, bytes] = {item.filename: archive.read(item.filename) for item in items}

    rewritten: dict[str, bytes] = {}
    for name, data in contents.items():
        folder = posixpath.dirname(name)
        if not (folder.startswith("ppt/slides") or folder.startswith("ppt/notesSlides")):
            continue
        if not name.endswith(".xml"):
            continue
        root = etree.fromstring(data, parser)
        changed = False
        for node in root.iter(f"{_A}t"):
            if not node.text:
                continue
            place = posixpath.basename(name).removesuffix(".xml")
            masked, count, sure, missing = _mask(node.text, settings, place, result.changes)
            if count:
                node.text = masked
                changed = True
            result.masked += count
            result.masked_confirmed += sure
            result.unscanned_categories.update(missing)
        if changed:
            rewritten[name] = etree.tostring(root, xml_declaration=True, encoding="UTF-8")

    with (
        zipfile.ZipFile(source) as archive,
        zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as out,
    ):
        for item in archive.infolist():
            name = item.filename
            if name in (_CORE_PART, _APP_PART):
                dropped.append(f"docProps {posixpath.basename(name)}")
                continue
            if "thumbnail" in posixpath.basename(name).lower():
                dropped.append("docProps thumbnail")
                continue
            out.writestr(item, rewritten.get(name, contents[name]))

    if dropped:
        _drop_relationships(target, dropped)
        result.metadata_removed.extend(dropped)
    result.output = target


def _drop_relationships(package: Path, dropped: list[str]) -> None:
    """Remove package relationships pointing at parts that are no longer there."""
    from lxml import etree

    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    rels_part = "_rels/.rels"

    with zipfile.ZipFile(package) as archive:
        if rels_part not in archive.namelist():
            return
        contents = {item.filename: archive.read(item.filename) for item in archive.infolist()}
        present = set(contents)

    root = etree.fromstring(contents[rels_part], parser)
    for relationship in list(root):
        target_ref = relationship.get("Target", "").lstrip("/")
        if target_ref and target_ref not in present:
            root.remove(relationship)
    contents[rels_part] = etree.tostring(root, xml_declaration=True, encoding="UTF-8")

    with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED) as out:
        for name, data in contents.items():
            out.writestr(name, data)
