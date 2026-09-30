"""JSON output, for machine consumption and for diffing runs over time.

Two shapes, chosen by `detail`:

`summary` (the default)
    Everything a finding, a score or a policy rests on, and the folder's cost on
    every model. Left out are two things a reader of the JSON rarely wants and
    that made up three quarters of it: the price of every document on every
    model, which was also stored twice, and the geometry of every word on every
    page, which the viewer draws pages with. For 200 one-page documents that is
    20 MB down to about 5. A run that asked for page images keeps them, since the
    report is the only place they go.
`full`
    Every field. Keep this for anything that reprocesses reports, since a summary
    reads back without the parts it left out. `run.report_detail` says which a
    file is, so a missing part is never mistaken for an empty one.

Page pictures are not written into the JSON. They made most of a large report,
which every reader of it then had to hold whole: 2,000 pages came to about 1 GB. Each
is written as a JPEG in a folder beside the report, `<report>.parts/pages/`, and the
page names its file in `image`, so the viewer fetches a picture when its page is
shown.

A report whose page text and layout come to more than `SPLIT_ABOVE` keeps those, too,
beside it: each document's in `<report>.parts/documents/<n>.json`, named in the
document's `parts`. What every page of the report is priced and listed by stays in the
JSON: its figures, its readers, and whether each read anything, a reading standing as
`…` where it read text and as empty where it read none. `load_report` puts the parts
back; the viewer fetches a document's when the document is opened. A smaller report is
one file, as before.
"""

from __future__ import annotations

import base64
import json
import shutil
from pathlib import Path
from typing import Any, Literal

from complydoc.report.models import AuditReport, to_jsonable
from complydoc.utils.files import write_text

__all__ = ["DETAIL_LEVELS", "Detail", "merge_parts", "parts_folder", "to_dict", "write_json"]

_JPEG = "data:image/jpeg;base64,"

SPLIT_ABOVE = 16 * 1024 * 1024
"""Characters of page text and layout above which a report keeps them beside it."""

HELD = "…"
"""A reading left in the JSON where its text is kept beside it, and there was text."""

_PAGE_TEXT = ("text", "ocr_text", "masked_text", "masked_ocr_text")
_PAGE_READINGS = ("readings", "masked_readings")
_PAGE_LAYOUT = ("text_blocks", "image_blocks", "gutters", "sensitive")

Detail = Literal["summary", "full"]
DETAIL_LEVELS: tuple[Detail, ...] = ("summary", "full")


def _model_totals(report: AuditReport) -> list[dict[str, Any]]:
    """Per-model folder totals, computed where the price list is at hand.

    A report read back from a summary no longer has the price list, so it keeps
    the totals it was written with rather than computing an empty table.
    """
    if report.cost is None:
        return []
    if report.cost.documents:
        from complydoc.cost.comparison import build_comparison

        return [dict(row) for row in to_jsonable(build_comparison(report))]
    return report.cost.models


def to_dict(report: AuditReport, *, detail: Detail = "summary") -> dict[str, Any]:
    """The report as JSON-ready data, in the shape `detail` names."""
    if detail not in DETAIL_LEVELS:
        raise ValueError(f"detail is one of {', '.join(DETAIL_LEVELS)}, not {detail!r}")

    data: dict[str, Any] = dict(to_jsonable(report))
    data["run"]["report_detail"] = detail
    if isinstance(data.get("cost"), dict):
        data["cost"]["models"] = _model_totals(report)
    if detail == "full":
        return data

    if isinstance(data.get("cost"), dict):
        data["cost"].pop("documents", None)
    for document in data.get("documents") or []:
        # Pictures asked for with --page-images are kept: the report is where the viewer
        # finds them, and nothing else would carry them.
        if not report.run.page_images_used:
            document.pop("previews", None)
        if isinstance(document.get("cost"), dict):
            document["cost"].pop("models", None)
    return data


def parts_folder(path: Path) -> Path:
    """The folder beside a report at `path` that holds what is kept out of its JSON."""
    return path.with_name(f"{path.stem}.parts")


def _pictures_out(content: dict[str, Any], path: Path) -> None:
    """Each page picture written as a file beside the report, and named in its place.

    The folder is the report's own: a report written again over the same path replaces
    its pictures, so none is left from the run before.
    """
    folder = parts_folder(path)
    pages = folder / "pages"
    if pages.exists():
        shutil.rmtree(pages)
    for index, document in enumerate(content.get("documents") or []):
        for preview in document.get("previews") or []:
            uri = preview.get("image_data_uri")
            if not isinstance(uri, str) or not uri.startswith(_JPEG):
                continue
            pages.mkdir(parents=True, exist_ok=True)
            name = f"{index:04d}-{int(preview.get('number') or 0):04d}.jpg"
            (pages / name).write_bytes(base64.b64decode(uri.removeprefix(_JPEG)))
            preview["image"] = f"{folder.name}/pages/{name}"
            preview["image_data_uri"] = None


def _detail_size(content: dict[str, Any]) -> int:
    total = 0
    for document in content.get("documents") or []:
        for page in document.get("extracted_text") or []:
            total += sum(len(page.get(field) or "") for field in _PAGE_TEXT)
            total += sum(
                len(text) for field in _PAGE_READINGS for text in (page.get(field) or {}).values()
            )
        for preview in document.get("previews") or []:
            total += sum(len(json.dumps(preview.get(field) or [])) for field in _PAGE_LAYOUT)
    return total


def _documents_out(content: dict[str, Any], path: Path) -> bool:
    """Each document's page text and layout written beside a large report. Whether it was."""
    folder = parts_folder(path) / "documents"
    if folder.exists():
        shutil.rmtree(folder)
    if _detail_size(content) <= SPLIT_ABOVE:
        return False
    folder.mkdir(parents=True)
    for index, document in enumerate(content.get("documents") or []):
        pages = []
        for page in document.get("extracted_text") or []:
            kept = {field: page.pop(field) for field in _PAGE_TEXT if field in page}
            for field in _PAGE_READINGS:
                readings = page.get(field)
                if isinstance(readings, dict):
                    kept[field] = readings
                    page[field] = {name: HELD if text else "" for name, text in readings.items()}
            pages.append({"number": page.get("number"), **kept})
        layouts = []
        for preview in document.get("previews") or []:
            kept = {field: preview.pop(field) for field in _PAGE_LAYOUT if field in preview}
            layouts.append({"number": preview.get("number"), **kept})
        name = f"{index:04d}.json"
        text = json.dumps({"extracted_text": pages, "previews": layouts}, ensure_ascii=False)
        (folder / name).write_text(text, encoding="utf-8")
        document["parts"] = f"{parts_folder(path).name}/documents/{name}"
    return True


def merge_parts(data: dict[str, Any], path: Path) -> dict[str, Any]:
    """`data`, a report read from `path`, with each document's parts put back."""
    for document in data.get("documents") or []:
        name = document.pop("parts", None)
        if not isinstance(name, str):
            continue
        part = json.loads((path.parent / name).read_text(encoding="utf-8"))
        for field, pieces in (
            ("extracted_text", part["extracted_text"]),
            ("previews", part["previews"]),
        ):
            by_number = {piece["number"]: piece for piece in pieces}
            for page in document.get(field) or []:
                page.update(
                    {
                        k: v
                        for k, v in by_number.get(page.get("number"), {}).items()
                        if k != "number"
                    }
                )
    return data


def write_json(report: AuditReport, path: Path, *, detail: Detail = "summary") -> Path:
    content = to_dict(report, detail=detail)
    path = Path(path).expanduser()
    _pictures_out(content, path)
    large = _documents_out(content, path)
    # sort_keys keeps two runs comparable with a plain diff; a large report is written
    # without the indentation, which is a good part of it over thousands of entries.
    indent = None if large else 2
    return write_text(
        path, json.dumps(content, indent=indent, sort_keys=True, ensure_ascii=False) + "\n"
    )
