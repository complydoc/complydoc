"""What changed between two reports.

    baseline = cd.load_report("baseline.json")
    changes = cd.diff_reports(baseline, cd.inspect_documents(loader))
    changes.regressions

Documents are matched by relative path. Each change states its area, the document
it belongs to, and whether it is worse: an identifier or hidden passage that
appeared, a score or text similarity that fell, a fact a loader no longer finds, a
new network attempt or failure, or a new important limitation.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from complydoc.report.models import AuditReport, DocumentReport
from complydoc.utils.frames import to_frame

__all__ = ["Change", "ReportDiff", "diff_reports"]

_RATING_RANK = {"poor": 0, "fair": 1, "good": 2}


@dataclass(frozen=True, slots=True)
class Change:
    area: str
    """`documents`, `identifiers`, `metadata`, `hidden`, `readiness`, `signals`,
    `similarity`, `global`, `facts`, `loaders` or `limitations`."""
    kind: str
    """`added`, `removed` or `changed`."""
    subject: str
    worse: bool
    document: str | None = None
    before: Any = None
    after: Any = None


@dataclass(frozen=True, slots=True)
class ReportDiff:
    old_version: str
    new_version: str
    changes: list[Change] = field(default_factory=list)

    @property
    def regressions(self) -> list[Change]:
        return [change for change in self.changes if change.worse]

    @property
    def improvements(self) -> list[Change]:
        return [change for change in self.changes if not change.worse]

    def __bool__(self) -> bool:
        return bool(self.changes)

    def rows(self) -> list[dict[str, Any]]:
        return [
            {
                "area": c.area,
                "kind": c.kind,
                "document": c.document,
                "subject": c.subject,
                "before": c.before,
                "after": c.after,
                "worse": c.worse,
            }
            for c in self.changes
        ]

    def to_pandas(self) -> Any:
        """The changes as a DataFrame. Requires the `notebook` extra."""
        columns = ["area", "kind", "document", "subject", "before", "after", "worse"]
        return to_frame(self.rows(), columns=columns)

    def summary(self) -> str:
        """One line per change."""
        lines = []
        for c in self.changes:
            where = f"{c.document}: " if c.document else ""
            values = f" ({c.before} -> {c.after})" if c.kind == "changed" else ""
            mark = "worse" if c.worse else "better"
            lines.append(f"[{mark}] {c.area} {c.kind}: {where}{c.subject}{values}")
        return "\n".join(lines) or "no changes"


def diff_reports(old: AuditReport, new: AuditReport, *, score_tolerance: float = 0.5) -> ReportDiff:
    """Changes from `old` to `new`. Score changes smaller than `score_tolerance` are ignored."""
    changes: list[Change] = []
    before = {d.relative_path: d for d in old.documents}
    after = {d.relative_path: d for d in new.documents}

    for name in sorted(before.keys() - after.keys()):
        changes.append(Change("documents", "removed", name, worse=True, document=name))
    for name in sorted(after.keys() - before.keys()):
        changes.append(Change("documents", "added", name, worse=False, document=name))

    for name in sorted(before.keys() & after.keys()):
        a, b = before[name], after[name]
        changes += _counted("identifiers", name, _identifiers(a), _identifiers(b))
        changes += _counted("metadata", name, _metadata(a), _metadata(b))
        changes += _counted("hidden", name, _hidden(a), _hidden(b))
        changes += _score(
            "readiness", name, "readiness score", _readiness(a), _readiness(b), score_tolerance
        )
        changes += _ratings(name, a, b)
        changes += _similarity(name, a, b)

    old_score = old.overall.score if old.overall else None
    new_score = new.overall.score if new.overall else None
    changes += _score("global", None, "global readiness", old_score, new_score, score_tolerance)
    changes += _facts(old, new)
    changes += _loaders(old, new)
    changes += _limitations(old, new)
    return ReportDiff(old.run.tool_version, new.run.tool_version, changes)


def _identifiers(document: DocumentReport) -> Counter[str]:
    matches = document.sensitive.matches if document.sensitive else []
    return Counter(f"{m.label}: {m.masked}" for m in matches)


def _metadata(document: DocumentReport) -> Counter[str]:
    return Counter(f"{f.key} {f.label}: {f.masked}" for f in document.metadata_findings)


def _hidden(document: DocumentReport) -> Counter[str]:
    return Counter(
        f"{f.severity} {f.visibility}/{f.instruction}: {f.excerpt[:80]}"
        for f in document.content_findings
    )


def _readiness(document: DocumentReport) -> float | None:
    score = document.readiness.score if document.readiness else None
    return score.value if score else None


def _counted(area: str, document: str, before: Counter[str], after: Counter[str]) -> list[Change]:
    changes = []
    for subject in sorted(before.keys() | after.keys()):
        delta = after[subject] - before[subject]
        if delta > 0:
            changes.append(
                Change(area, "added", subject, True, document, before[subject], after[subject])
            )
        elif delta < 0:
            changes.append(
                Change(area, "removed", subject, False, document, before[subject], after[subject])
            )
    return changes


def _score(
    area: str,
    document: str | None,
    subject: str,
    before: float | None,
    after: float | None,
    tolerance: float,
) -> list[Change]:
    if before is None or after is None or abs(after - before) < tolerance:
        return []
    return [Change(area, "changed", subject, after < before, document, before, after)]


def _ratings(document: str, a: DocumentReport, b: DocumentReport) -> list[Change]:
    old = {s.id: s.rating for s in a.readiness.signals} if a.readiness else {}
    new = {s.id: s.rating for s in b.readiness.signals} if b.readiness else {}
    changes = []
    for signal in sorted(old.keys() & new.keys()):
        was, now = old[signal], new[signal]
        if was is None or now is None or was == now:
            continue
        worse = _RATING_RANK[now] < _RATING_RANK[was]
        changes.append(Change("signals", "changed", signal, worse, document, was, now))
    return changes


def _similarity(document: str, a: DocumentReport, b: DocumentReport) -> list[Change]:
    old = {r.extractor: r.similarity for r in a.extractions[1:]}
    new = {r.extractor: r.similarity for r in b.extractions[1:]}
    return [
        Change(
            "similarity",
            "changed",
            reader,
            new[reader] < old[reader],
            document,
            old[reader],
            new[reader],
        )
        for reader in sorted(old.keys() & new.keys())
        if abs(new[reader] - old[reader]) >= 0.01
    ]


def _facts(old: AuditReport, new: AuditReport) -> list[Change]:
    def found(report: AuditReport) -> dict[tuple[str, str], bool]:
        comparison = report.loader_comparison
        if comparison is None:
            return {}
        return {
            (check.fact, loader): bool(kind)
            for check in comparison.facts
            for loader, kind in check.found.items()
        }

    was, now = found(old), found(new)
    changes = []
    for fact, loader in sorted(was.keys() & now.keys()):
        if was[(fact, loader)] and not now[(fact, loader)]:
            changes.append(Change("facts", "removed", f"{loader}: {fact}", True))
        elif now[(fact, loader)] and not was[(fact, loader)]:
            changes.append(Change("facts", "added", f"{loader}: {fact}", False))
    return changes


def _loaders(old: AuditReport, new: AuditReport) -> list[Change]:
    def rows(report: AuditReport) -> dict[str, tuple[int, int]]:
        if report.loader_comparison is not None:
            return {
                r.name: (len(r.network_attempts), len(r.failures))
                for r in report.loader_comparison.loaders
            }
        if report.loader is not None:
            return {
                report.loader.name: (
                    len(report.loader.network_attempts),
                    len(report.loader.failures),
                )
            }
        return {}

    was, now = rows(old), rows(new)
    changes = []
    for name in sorted(was.keys() & now.keys()):
        for index, label in ((0, "network attempts"), (1, "failed files")):
            if now[name][index] != was[name][index]:
                worse = now[name][index] > was[name][index]
                changes.append(
                    Change(
                        "loaders",
                        "changed",
                        f"{name} {label}",
                        worse,
                        None,
                        was[name][index],
                        now[name][index],
                    )
                )
    return changes


def _limitations(old: AuditReport, new: AuditReport) -> list[Change]:
    def important(report: AuditReport) -> set[str]:
        return {
            f"{item.area}: {item.statement}"
            for item in report.limitations
            if item.severity == "important"
        }

    was, now = important(old), important(new)
    return [Change("limitations", "added", s, True) for s in sorted(now - was)] + [
        Change("limitations", "removed", s, False) for s in sorted(was - now)
    ]
