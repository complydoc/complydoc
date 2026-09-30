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
which every reader of it then had to hold whole: 1,671 of them came to 427 MB. Each
is written as a JPEG in a folder beside the report, `<report>.parts/pages/`, and the
page names its file in `image`, so the viewer fetches a picture when its page is
shown.
"""

from __future__ import annotations

import base64
import json
import shutil
from pathlib import Path
from typing import Any, Literal

from complydoc.report.models import AuditReport, to_jsonable
from complydoc.utils.files import write_text

__all__ = ["DETAIL_LEVELS", "Detail", "parts_folder", "to_dict", "write_json"]

_JPEG = "data:image/jpeg;base64,"

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


def write_json(report: AuditReport, path: Path, *, detail: Detail = "summary") -> Path:
    content = to_dict(report, detail=detail)
    _pictures_out(content, Path(path).expanduser())
    # sort_keys keeps two runs comparable with a plain diff.
    return write_text(
        path, json.dumps(content, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )
