"""What of a report is sent to the model, and what is held back.

The prompt used to interpolate the `AuditReport` itself, which formats as its
Python repr: 194,000 tokens for the ten-page sample, and 509,000 with
`--page-images`, where every page picture goes as base64 text. Most of that is
not what quick wins are drawn from.

So the report is sent as JSON in the summary shape a report is written in,
which already leaves out the price of every document on every model and the
page geometry, pictures included. On top of that:

`documents[].extracted_text`
    The text read off each page. Masked, but still the document, and a whole
    folder of it for one paragraph of advice.

Together these take the ten-page sample from 509,000 tokens with page pictures,
or 193,000 without, to about 52,000. What is left grows with the folder: it is
roughly 5,000 tokens a document, so a large folder still needs `--sample` on
the audit that wrote the report, or a model with room for it.

Everything a quick win rests on stays: the readiness signals and their reasons,
the routing plan, the findings, the loaders and their differences, the cost
totals, and the limitations.
"""

from __future__ import annotations

import json
from typing import Any

from complydoc.report.json_writer import to_dict
from complydoc.report.models import AuditReport

__all__ = ["HELD_BACK", "report_payload"]

HELD_BACK = ("extracted_text",)
"""Per-document keys left out on top of what a summary report already leaves out."""


def report_payload(report: AuditReport) -> str:
    """The report as compact JSON: the summary shape, without the page text."""
    data: dict[str, Any] = to_dict(report, detail="summary")
    for document in data.get("documents") or []:
        for key in HELD_BACK:
            document.pop(key, None)
    return json.dumps(data, ensure_ascii=False, sort_keys=True)
