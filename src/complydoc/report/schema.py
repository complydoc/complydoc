"""The report's JSON Schema, generated from the classes that write it.

`report_shape()` in `models` is a summary for a person. This is the whole shape, for a
program: every key a report holds, with its type, as JSON Schema draft 2020-12. It is
generated, so it cannot drift from what a run writes, and each schema version is
published at an address of its own.
"""

from __future__ import annotations

from typing import Any

from complydoc.report.models import SCHEMA_VERSION, AuditReport

__all__ = ["SCHEMA_ADDRESS", "report_json_schema", "schema_address"]

SCHEMA_ADDRESS = "https://complydoc.github.io/complydoc/docs/schema"
"""Where the published schemas are: `report-<version>.json`, and `report.json` for the newest."""


def schema_address(version: int = SCHEMA_VERSION) -> str:
    return f"{SCHEMA_ADDRESS}/report-{version}.json"


def report_json_schema() -> dict[str, Any]:
    """The JSON Schema of a report at this version's `schema_version`."""
    from pydantic import TypeAdapter

    # The classes `models` names only for type checking, as the reader resolves them.
    from complydoc.extraction.chunks import ChunkReport
    from complydoc.extraction.routing import DocumentRouting
    from complydoc.report.overall import OverallReadiness
    from complydoc.report.quickwins import QuickWin
    from complydoc.report.routing import RoutingSummary

    adapter = TypeAdapter(AuditReport)
    adapter.rebuild(
        force=True,
        _types_namespace={
            "OverallReadiness": OverallReadiness,
            "QuickWin": QuickWin,
            "ChunkReport": ChunkReport,
            "DocumentRouting": DocumentRouting,
            "RoutingSummary": RoutingSummary,
        },
    )
    generated = adapter.json_schema()
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": schema_address(),
        "title": f"complydoc report, schema {SCHEMA_VERSION}",
        "description": (
            "What a complydoc run writes: an audit, a cost or readiness run, a loader "
            "comparison, a chunks run or a pipeline's trace. `run.schema_version` says "
            "which version of this shape a file holds."
        ),
        **{key: value for key, value in generated.items() if key != "title"},
    }
