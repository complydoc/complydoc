"""JSON output, for machine consumption and for diffing runs over time."""

from __future__ import annotations

import json
from pathlib import Path

from complydoc.report.models import AuditReport, to_jsonable
from complydoc.utils.files import write_text

__all__ = ["to_dict", "write_json"]


def to_dict(report: AuditReport) -> dict[str, object]:
    return dict(to_jsonable(report))


def write_json(report: AuditReport, path: Path) -> Path:
    # sort_keys keeps two runs comparable with a plain diff.
    content = json.dumps(to_dict(report), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    return write_text(path, content)
