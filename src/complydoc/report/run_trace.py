"""An audit's own run as a trace: each document, and inside it each reader, OCR, the
analysis, the identifier scan and a vision check where there was one.

Built from what the run already measured, so it costs nothing to record. A document's
place in time is when it began to be read, which several worker processes do at once. Its
steps are laid end to end from there in the order they run, each as long as it took: the
steps themselves are timed, not their starts.
"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import PurePath
from typing import Any

from complydoc.report.models import (
    AuditReport,
    DocumentReport,
    StageIdentifier,
    Trace,
    TraceStage,
)
from complydoc.sensitive.base import SensitiveMatch

__all__ = ["audit_trace"]

_SEVERITY = {"high": 0, "medium": 1, "low": 2}


def _identifiers(matches: Iterable[SensitiveMatch]) -> list[StageIdentifier]:
    found: dict[str, StageIdentifier] = {}
    for match in matches:
        key = match.fingerprint or f"{match.category}:{match.masked}"
        seen = found.get(key)
        found[key] = StageIdentifier(
            key,
            match.label,
            match.masked,
            match.severity,
            (seen.occurrences if seen else 0) + 1,
            match.evidence,
        )
    return sorted(found.values(), key=lambda i: (_SEVERITY.get(i.severity, 3), i.label))


class _Spans:
    """The stages of a trace, added in order, each child placed after the one before it."""

    def __init__(self) -> None:
        self.stages: list[TraceStage] = []

    def add(self, kind: str, component: str, seconds: float, started: float, **fields: Any) -> int:
        index = len(self.stages)
        self.stages.append(
            TraceStage(
                index=index,
                kind=kind,
                component=component,
                module="complydoc.audit",
                method=kind,
                seconds=round(seconds, 4),
                started=round(started, 4),
                **fields,
            )
        )
        return index

    def document(self, document: DocumentReport, start: float) -> None:
        timing = document.timing
        identifiers = _identifiers(document.sensitive.matches if document.sensitive else [])
        scanned = "full" if document.sensitive is not None else "off"
        parent = self.add(
            "document",
            PurePath(document.relative_path).name,
            timing.total_seconds if timing is not None else 0.0,
            start,
            parameters={
                "path": document.relative_path,
                "format": document.format.value,
                "pages": document.page_count,
            },
            documents_out=document.page_count,
            characters_out=document.extractions[0].characters if document.extractions else None,
            sources=[document.relative_path],
            scanned=scanned,
            identifiers=identifiers,
            hidden=len(document.content_findings),
        )
        at = start
        steps: list[tuple[str, str, float, dict[str, Any]]] = [
            ("read", reading.extractor, reading.seconds, {"characters_out": reading.characters})
            for reading in document.extractions
        ]
        ocr = sum(page.seconds.get("ocr", 0.0) for page in document.extracted_text)
        if ocr:
            steps.append(("ocr", "OCR", ocr, {}))
        if timing is not None and timing.analyse_seconds:
            steps.append(("analyse", "Readiness and cost", timing.analyse_seconds, {}))
        if timing is not None and document.sensitive is not None:
            steps.append(
                (
                    "scan",
                    "Identifier scan",
                    timing.scan_seconds,
                    {"scanned": scanned, "identifiers": identifiers},
                )
            )
        verification = document.verification
        if verification is not None:
            usd = verification.usd
            steps.append(
                (
                    "verify",
                    verification.model,
                    sum(page.seconds or 0.0 for page in verification.pages),
                    {
                        "hosts": list(verification.sent_to),
                        "usd": usd,
                        "usd_basis": "estimated" if usd is not None else None,
                    },
                )
            )
        for kind, component, seconds, fields in steps:
            self.add(kind, component, seconds, at, parent=parent, **fields)
            at += seconds


def audit_trace(report: AuditReport, began: float) -> Trace:
    """The run's documents as spans, placed from `began`, the run's start in epoch seconds."""
    spans = _Spans()
    cursor = 0.0
    for document in report.documents:
        timing = document.timing
        if timing is not None and timing.started_at is not None:
            start = max(0.0, timing.started_at - began)
        else:
            # An entry that does not say when it began was read after the one before it.
            start = cursor
        cursor = max(cursor, start + (timing.total_seconds if timing is not None else 0.0))
        spans.document(document, start)
    return Trace(
        name=PurePath(report.run.target).name or report.run.target,
        scan="full",
        seconds=report.run.duration_seconds,
        overhead_seconds=0.0,
        stages=spans.stages,
        kind="audit",
    )
