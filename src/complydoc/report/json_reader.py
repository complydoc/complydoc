"""Reading a report back from the JSON a run writes.

    report = cd.load_report("baseline.json")

The result is the same typed `AuditReport` the run produced. Conversion follows
the type annotations of the report dataclasses, so a field added to a report is
read without changes here. Keys the current version does not know are ignored.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import enum
import json
import os
import sys
import types
import typing
from collections.abc import Mapping
from functools import cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from complydoc.report.models import SCHEMA_VERSION, AuditReport

READABLE_SCHEMA_VERSIONS = (5, 6, SCHEMA_VERSION)
"""Schema versions `load_report` reads. Versions that only added fields are included."""

__all__ = ["READABLE_SCHEMA_VERSIONS", "from_jsonable", "load_report"]


def load_report(source: str | os.PathLike[str] | Mapping[str, Any]) -> AuditReport:
    """An `AuditReport` from a JSON file written by `write_json`, or from its parsed data.

    Raises `ValueError` for a `schema_version` not in `READABLE_SCHEMA_VERSIONS`.
    Fields missing from an older report take their default values.
    """
    if isinstance(source, Mapping):
        data = dict(source)
    else:
        data = json.loads(Path(source).expanduser().read_text(encoding="utf-8"))
    version = data.get("run", {}).get("schema_version")
    if version not in READABLE_SCHEMA_VERSIONS:
        readable = ", ".join(map(str, READABLE_SCHEMA_VERSIONS))
        raise ValueError(
            f"this report has schema_version {version}; this version of complydoc reads "
            f"schema_version {readable}"
        )
    report = from_jsonable(AuditReport, data)
    assert isinstance(report, AuditReport)
    return report


@cache
def _hints(cls: type) -> dict[str, Any]:
    # Resolved on first use: `models` imports these two only for type checking.
    from complydoc.report.overall import OverallReadiness
    from complydoc.report.quickwins import QuickWin

    extra = {"OverallReadiness": OverallReadiness, "QuickWin": QuickWin}
    return typing.get_type_hints(cls, globalns=vars(sys.modules[cls.__module__]), localns=extra)


def from_jsonable(tp: Any, value: Any) -> Any:
    """`value`, parsed from JSON, converted to the annotated type `tp`."""
    if value is None:
        return None
    origin = typing.get_origin(tp)

    if origin in (typing.Union, types.UnionType):
        options = [arg for arg in typing.get_args(tp) if arg is not type(None)]
        return from_jsonable(options[0], value) if len(options) == 1 else value
    if origin is list:
        (item,) = typing.get_args(tp)
        return [from_jsonable(item, element) for element in value]
    if origin is dict:
        _key, item = typing.get_args(tp)
        return {key: from_jsonable(item, element) for key, element in value.items()}
    if origin is not None:
        return value

    if isinstance(tp, type):
        if dataclasses.is_dataclass(tp):
            hints = _hints(tp)
            arguments = {
                field.name: from_jsonable(hints[field.name], value[field.name])
                for field in dataclasses.fields(tp)
                if field.init and field.name in value
            }
            return tp(**arguments)
        if issubclass(tp, BaseModel):
            return tp.model_validate(value)
        if issubclass(tp, enum.Enum):
            return tp(value)
        if issubclass(tp, Path):
            return Path(value)
        if issubclass(tp, dt.date):
            return dt.date.fromisoformat(value)
    return value
