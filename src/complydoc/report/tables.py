"""Reports as tables, for notebooks and pandas.

    report = cd.full_audit("./documents")
    report                               # renders a summary in Jupyter
    report.to_pandas("identifiers")      # one row per identifier

`table_rows` returns plain dictionaries and needs nothing installed. `to_pandas`
wraps them in a DataFrame and needs the `notebook` extra.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from html import escape
from typing import TYPE_CHECKING, Any

from complydoc.utils.frames import to_frame

if TYPE_CHECKING:
    from complydoc.report.models import AuditReport

__all__ = ["COLUMNS", "TABLES", "summary_html", "table_rows", "to_pandas"]

Row = dict[str, Any]


def _documents(report: AuditReport) -> Iterator[Row]:
    scores = report.overall.by_document if report.overall else {}
    for d in report.documents:
        score = d.readiness.score if d.readiness else None
        yield {
            "document": d.relative_path,
            "format": d.format.value,
            "pages": d.page_count,
            "page_count_known": d.page_count_known,
            "readiness_score": score.value if score else None,
            "readiness_label": score.label if score else None,
            "global_score": scores.get(d.relative_path),
            "identifiers": d.sensitive.total if d.sensitive else None,
            "hidden_passages": len(d.content_findings),
            "hidden_high": sum(1 for f in d.content_findings if f.severity == "high"),
            "visibility_checked": d.visibility_checked,
            "load_warnings": len(d.load_warnings),
            "seconds": d.timing.total_seconds if d.timing else None,
        }


def _pages(report: AuditReport) -> Iterator[Row]:
    for d in report.documents:
        for page in d.extracted_text:
            yield {
                "document": d.relative_path,
                "page": page.number,
                "source": page.source,
                "characters": page.characters,
                "truncated": page.truncated,
                "text": page.text,
            }


def _identifiers(report: AuditReport) -> Iterator[Row]:
    for d in report.documents:
        for m in d.sensitive.matches if d.sensitive else []:
            yield {
                "document": d.relative_path,
                "page": m.page,
                "line": m.line,
                "category": m.category,
                "label": m.label,
                "severity": m.severity,
                "evidence": m.evidence,
                "value": m.revealed if m.revealed is not None else m.masked,
                "confidence": m.confidence,
            }


def _signals(report: AuditReport) -> Iterator[Row]:
    for d in report.documents:
        for s in d.readiness.signals if d.readiness else []:
            yield {
                "document": d.relative_path,
                "signal": s.id,
                "name": s.name,
                "status": s.status.value,
                "value": s.value,
                "display": s.display,
                "rating": s.rating,
                "weight": s.weight,
                "reason": s.reason,
            }


def _hidden(report: AuditReport) -> Iterator[Row]:
    for d in report.documents:
        for f in d.content_findings:
            yield {
                "document": d.relative_path,
                "page": f.page,
                "visibility": f.visibility,
                "instruction": f.instruction,
                "severity": f.severity,
                "hidden_reasons": "; ".join(f.hidden_reasons),
                "instruction_reasons": "; ".join(f.instruction_reasons),
                "excerpt": f.excerpt,
                "score": f.score,
                "in_loader_output": f.in_loader_output,
            }


def _metadata(report: AuditReport) -> Iterator[Row]:
    for d in report.documents:
        for f in d.metadata_findings:
            yield {
                "document": d.relative_path,
                "key": f.key,
                "category": f.category,
                "label": f.label,
                "severity": f.severity,
                "evidence": f.evidence,
                "value": f.revealed if f.revealed is not None else f.masked,
                "significant": f.significant,
            }


def _limitations(report: AuditReport) -> Iterator[Row]:
    for limitation in report.limitations:
        yield {
            "area": limitation.area,
            "severity": limitation.severity,
            "statement": limitation.statement,
            "affected": len(limitation.affected),
        }


def _quick_wins(report: AuditReport) -> Iterator[Row]:
    for win in report.quick_wins:
        yield {
            "id": win.id,
            "title": win.title,
            "actor": win.actor,
            "documents": len(win.documents),
            "effect": win.effect,
            "saving_usd_per_1000": win.saving_usd_per_1000,
        }


def _loaders(report: AuditReport) -> Iterator[Row]:
    comparison = report.loader_comparison
    if comparison is None:
        return
    for row in comparison.loaders:
        yield {
            "loader": row.name,
            "tags": ", ".join(row.tags),
            "baseline": row.name == comparison.baseline,
            "documents": row.documents,
            "pages": row.pages,
            "characters": row.characters,
            "seconds": row.seconds,
            "network_allowed": row.network_allowed,
            "network_attempts": len(row.network_attempts),
            "error": row.error,
            "metadata_keys": len(row.metadata_keys),
            "identifiers_in_text": row.identifiers_in_text,
            "identifiers_in_metadata": row.identifiers_in_metadata,
            "readiness_score": row.readiness_score,
            "global_score": row.global_score,
            "failed_files": len(row.failures),
            "cached_files": row.cached_files,
            "facts_found": row.facts_found,
            "parser_usd": row.parser_usd,
        }


def _file_types(report: AuditReport) -> Iterator[Row]:
    comparison = report.loader_comparison
    if comparison is None:
        return
    for by_type in comparison.formats:
        given = {row.name: row for row in by_type.loaders}
        for loader in comparison.loaders:
            row = given.get(loader.name)
            yield {
                "format": by_type.format,
                "files": by_type.documents,
                "loader": loader.name,
                "given": row is not None,
                "documents": row.documents if row else 0,
                "pages": row.pages if row else 0,
                "characters": row.characters if row else 0,
                "seconds": row.seconds if row else None,
                "similarity": row.similarity if row else None,
                "failed_files": len(row.failures) if row else 0,
                "facts_found": row.facts_found if row else None,
                "recommended": by_type.recommended == loader.name,
            }


def _differences(report: AuditReport) -> Iterator[Row]:
    comparison = report.loader_comparison
    if comparison is None:
        return
    for d in comparison.identifier_differences:
        yield {
            "document": d.document,
            "category": d.category,
            "severity": d.severity,
            "evidence": d.evidence,
            "location": d.location,
            "keys": ", ".join(d.keys),
            "value": d.value,
            "found_by": ", ".join(d.found_by),
            "missed_by": ", ".join(d.missed_by),
        }


def _facts(report: AuditReport) -> Iterator[Row]:
    comparison = report.loader_comparison
    if comparison is None:
        return
    for check in comparison.facts:
        for loader, kind in check.found.items():
            yield {
                "fact": check.fact,
                "document": check.document,
                "loader": loader,
                "found": kind,
                "score": check.scores.get(loader),
                "page": check.pages.get(loader),
                "matched_document": check.documents.get(loader),
            }


_BUILDERS: dict[str, Callable[[AuditReport], Iterator[Row]]] = {
    "documents": _documents,
    "pages": _pages,
    "identifiers": _identifiers,
    "signals": _signals,
    "hidden": _hidden,
    "metadata": _metadata,
    "limitations": _limitations,
    "quick_wins": _quick_wins,
    "loaders": _loaders,
    "loader_formats": _file_types,
    "differences": _differences,
    "facts": _facts,
}

COLUMNS: dict[str, tuple[str, ...]] = {
    "documents": (
        "document", "format", "pages", "page_count_known", "readiness_score",
        "readiness_label", "global_score", "identifiers", "hidden_passages", "hidden_high",
        "visibility_checked", "load_warnings", "seconds",
    ),
    "pages": ("document", "page", "source", "characters", "truncated", "text"),
    "identifiers": (
        "document", "page", "line", "category", "label", "severity", "evidence", "value",
        "confidence",
    ),
    "signals": (
        "document", "signal", "name", "status", "value", "display", "rating", "weight", "reason",
    ),
    "hidden": (
        "document", "page", "visibility", "instruction", "severity", "hidden_reasons",
        "instruction_reasons", "excerpt", "score", "in_loader_output",
    ),
    "metadata": (
        "document", "key", "category", "label", "severity", "evidence", "value", "significant",
    ),
    "limitations": ("area", "severity", "statement", "affected"),
    "quick_wins": ("id", "title", "actor", "documents", "effect", "saving_usd_per_1000"),
    "loaders": (
        "loader", "tags", "baseline", "documents", "pages", "characters", "seconds",
        "network_allowed",
        "network_attempts", "error", "metadata_keys", "identifiers_in_text",
        "identifiers_in_metadata", "readiness_score", "global_score", "failed_files",
        "cached_files",
        "facts_found", "parser_usd",
    ),
    "loader_formats": (
        "format", "files", "loader", "given", "documents", "pages", "characters", "seconds",
        "similarity", "failed_files", "facts_found", "recommended",
    ),
    "differences": (
        "document", "category", "severity", "evidence", "location", "keys", "value",
        "found_by", "missed_by",
    ),
    "facts": ("fact", "document", "loader", "found", "score", "page", "matched_document"),
}  # fmt: skip
"""Column names per table, in order. Used for empty tables and checked by tests."""

TABLES = tuple(_BUILDERS)
"""The table names `table_rows` and `to_pandas` accept."""


def table_rows(report: AuditReport, table: str = "documents") -> list[Row]:
    """One dictionary per row of `table`. See `TABLES` for the names."""
    builder = _BUILDERS.get(table)
    if builder is None:
        raise ValueError(f"unknown table {table!r}; choose one of: {', '.join(TABLES)}")
    return list(builder(report))


def to_pandas(report: AuditReport, table: str = "documents") -> Any:
    """`table` as a pandas DataFrame. Requires the `notebook` extra."""
    rows = table_rows(report, table)
    return to_frame(rows, columns=list(COLUMNS[table]))


def summary_html(report: AuditReport) -> str:
    """A short HTML summary for Jupyter's rich display."""
    rows: list[tuple[str, str]] = []
    aggregate = report.aggregate
    if aggregate is not None:
        rows.append(("Documents", f"{aggregate.documents_audited} ({aggregate.pages_total} pages)"))
        if aggregate.documents_skipped:
            rows.append(("Skipped", str(aggregate.documents_skipped)))
        if aggregate.mean_readiness_score is not None:
            rows.append(("AI readiness", f"{aggregate.mean_readiness_score}/100"))
    if report.overall is not None and report.overall.score is not None:
        rows.append(("Global readiness", f"{report.overall.score}/100 {report.overall.label}"))
    if aggregate is not None and "sensitive" in report.run.components_run:
        rows.append(("Identifiers", str(aggregate.sensitive_total)))
        rows.append(
            (
                "Hidden passages",
                f"{aggregate.content_findings_total} ({aggregate.content_findings_high} high)",
            )
        )
    if report.loader_comparison is not None:
        rows.append(
            ("Loaders compared", ", ".join(r.name for r in report.loader_comparison.loaders))
        )
    elif report.loader is not None:
        rows.append(("Loader", report.loader.name))
    important = sum(1 for item in report.limitations if item.severity == "important")
    rows.append(("Important limitations", str(important)))

    body = "".join(
        f"<tr><th style='text-align:left;padding-right:1em'>{escape(label)}</th>"
        f"<td>{escape(value)}</td></tr>"
        for label, value in rows
    )
    names = ", ".join(f"<code>{name}</code>" for name in TABLES)
    return (
        f"<div><strong>complydoc report</strong><table>{body}</table>"
        f"<p><code>report.to_pandas(table)</code> with table one of {names}.</p></div>"
    )
