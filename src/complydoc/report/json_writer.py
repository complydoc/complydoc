"""JSON output, for machine consumption and for diffing runs over time.

Two shapes, chosen by `detail`:

`summary` (the default)
    Everything a finding, a score or a policy rests on, and the folder's cost on
    every model. Left out are two things a reader of the JSON rarely wants and
    that made up three quarters of it: the price of every document on every
    model, which was also stored twice, and the geometry of every word on every
    page, which exists to draw the HTML report's page views. For 200 one-page
    documents that is 20 MB down to about 5.
`full`
    Every field. Keep this for anything that reprocesses reports, since a summary
    reads back without the parts it left out. `run.report_detail` says which a
    file is, so a missing part is never mistaken for an empty one.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from complydoc.report.models import AuditReport, to_jsonable
from complydoc.utils.files import write_text

__all__ = ["DETAIL_LEVELS", "Detail", "to_dict", "write_json"]

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
        from complydoc.report.charts import build_comparison

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
        document.pop("previews", None)
        if isinstance(document.get("cost"), dict):
            document["cost"].pop("models", None)
    return data


def write_json(report: AuditReport, path: Path, *, detail: Detail = "summary") -> Path:
    # sort_keys keeps two runs comparable with a plain diff.
    content = to_dict(report, detail=detail)
    return write_text(
        path, json.dumps(content, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )
