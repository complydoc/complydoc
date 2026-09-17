"""What of a report is sent to the model, and what is held back.

The prompt used to interpolate the `AuditReport` itself, which formats as its
Python repr: 194,000 tokens for the ten-page sample, and 509,000 with
`--page-images`, where every page picture goes as base64 text. Most of that is
not what quick wins are drawn from.

So the report is sent as JSON with two parts dropped:

`documents[].previews`
    Page geometry, and the page pictures when the run embedded them. A quick
    win is never read off a base64 JPEG.
`documents[].extracted_text`
    The text read off each page. Masked, but still the document, and a whole
    folder of it for one paragraph of advice.

`documents[].cost.models` and `cost.documents`
    Every priced model against every document, twice over. That is a price list
    crossed with a folder, and it was most of what remained. The per-document
    token counts stay, and so do the folder totals in `aggregate`, which is
    where a cost answer comes from anyway.

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

HELD_BACK = ("previews", "extracted_text")
"""Per-document keys left out of what is sent."""


def _document(document: Any) -> Any:
    if not isinstance(document, dict):
        return document
    kept = {k: v for k, v in document.items() if k not in HELD_BACK}
    cost = kept.get("cost")
    if isinstance(cost, dict):
        kept["cost"] = {k: v for k, v in cost.items() if k != "models"}
    return kept


def report_payload(report: AuditReport) -> str:
    """The report as compact JSON, without the parts this module holds back."""
    data: dict[str, Any] = to_dict(report)
    documents = data.get("documents")
    if isinstance(documents, list):
        data["documents"] = [_document(d) for d in documents]
    cost = data.get("cost")
    if isinstance(cost, dict):
        data["cost"] = {k: v for k, v in cost.items() if k != "documents"}
    return json.dumps(data, ensure_ascii=False, sort_keys=True)
