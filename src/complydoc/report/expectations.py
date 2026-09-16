"""Assertions on reports, for tests and CI.

    cd.expect(report).no_hidden(severity="high").no_network().facts_found()

Each check returns the expectation, so checks chain. A failed check raises
`ExpectationError`, a subclass of `AssertionError`, listing what failed it.

The same checks are what a policy file names; see `complydoc.report.policy`.
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Sequence
from typing import Any

from complydoc.extraction.facts import FUZZY_THRESHOLD, Fact, check_facts
from complydoc.report.compare import diff_reports
from complydoc.report.json_reader import load_report
from complydoc.report.models import AuditReport
from complydoc.sensitive.base import EVIDENCE_ORDER, SEVERITY_WEIGHT

__all__ = ["Expectation", "ExpectationError", "expect"]

_SHOWN = 20


class ExpectationError(AssertionError):
    """A report did not meet an expectation."""


def expect(report: AuditReport) -> Expectation:
    """Start a chain of checks on `report`."""
    return Expectation(report)


class Expectation:
    def __init__(self, report: AuditReport, *, collect: bool = False) -> None:
        self.report = report
        self.collect = collect
        """Gather results instead of raising, so every check runs. Used by policies."""
        self.collected: list[tuple[str, list[str]]] = []

    def _check(self, description: str, failures: Sequence[str]) -> Expectation:
        if self.collect:
            self.collected.append((description, list(failures)))
            return self
        if failures:
            shown = "\n".join(f"  - {item}" for item in failures[:_SHOWN])
            more = f"\n  and {len(failures) - _SHOWN} more" if len(failures) > _SHOWN else ""
            raise ExpectationError(
                f"expected {description}; {len(failures)} failed:\n{shown}{more}"
            )
        return self

    def no_identifiers(
        self,
        *,
        severity: str | None = None,
        evidence: str | None = None,
        categories: Iterable[str] | None = None,
    ) -> Expectation:
        """No identifiers in text or metadata at or above `severity` and `evidence`."""
        wanted = set(categories) if categories is not None else None
        floor = SEVERITY_WEIGHT.get(severity, 0) if severity else 0
        strongest = EVIDENCE_ORDER.index(evidence) if evidence else len(EVIDENCE_ORDER)

        def counts(category: str, item_severity: str, item_evidence: str) -> bool:
            return (
                (wanted is None or category in wanted)
                and SEVERITY_WEIGHT.get(item_severity, 0) >= floor
                and EVIDENCE_ORDER.index(item_evidence) <= strongest
            )

        failures = []
        for d in self.report.documents:
            for m in d.sensitive.matches if d.sensitive else []:
                if counts(m.category, m.severity, m.evidence):
                    failures.append(f"{d.relative_path} p{m.page}: {m.label} {m.masked}")
            for f in d.metadata_findings:
                if counts(f.category, f.severity, f.evidence):
                    failures.append(f"{d.relative_path} metadata {f.key}: {f.label} {f.masked}")
        return self._check("no identifiers", failures)

    def no_hidden(self, *, severity: str = "medium") -> Expectation:
        """No hidden or instruction-like passages at or above `severity`."""
        floor = SEVERITY_WEIGHT.get(severity, 0)
        failures = [
            f"{d.relative_path} p{f.page}: {f.severity}, {f.visibility}/{f.instruction}: "
            f"{f.excerpt[:80]}"
            for d in self.report.documents
            for f in d.content_findings
            if SEVERITY_WEIGHT.get(f.severity, 0) >= floor
        ]
        return self._check(f"no hidden passages of {severity} severity or above", failures)

    def readiness_at_least(self, score: float) -> Expectation:
        """Every scored document has a readiness score of at least `score`."""
        scored = [
            (d.relative_path, d.readiness.score.value)
            for d in self.report.documents
            if d.readiness and d.readiness.score
        ]
        if not scored:
            return self._check("readiness scores", ["no document has a readiness score"])
        failures = [f"{name}: {value}" for name, value in scored if value < score]
        return self._check(f"readiness of at least {score}", failures)

    def global_score_at_least(self, score: float) -> Expectation:
        overall = self.report.overall
        value = overall.score if overall else None
        failures = [] if value is not None and value >= score else [f"global readiness is {value}"]
        return self._check(f"global readiness of at least {score}", failures)

    def facts_found(
        self, facts: Iterable[Fact | str] | None = None, *, threshold: float = FUZZY_THRESHOLD
    ) -> Expectation:
        """Every fact found by every loader.

        Without `facts`, uses the facts of a `compare_loaders` report.
        """
        if facts is not None:
            checks = check_facts(self.report, facts, threshold=threshold)
        elif self.report.loader_comparison is not None:
            checks = self.report.loader_comparison.facts
        else:
            raise ValueError("pass facts, or use a compare_loaders report that has facts")
        failures = [
            f"{loader}: {check.fact}"
            for check in checks
            for loader, kind in check.found.items()
            if not kind
        ]
        return self._check("every fact to be found", failures)

    def no_network(self) -> Expectation:
        """No loader attempted or made a network connection."""
        failures = [
            f"{name}: {attempt}" for name, attempt in self._loader_values("network_attempts")
        ]
        return self._check("no network connections", failures)

    def no_failures(self) -> Expectation:
        """No loader failed on a file, and no file was skipped."""
        failures = [f"{name}: {path}" for name, path in self._loader_values("failures")]
        failures += [f"skipped {s.path}: {s.reason}" for s in self.report.skipped]
        if self.report.loader is not None and self.report.loader.error:
            failures.append(f"{self.report.loader.name}: {self.report.loader.error}")
        return self._check("no failures", failures)

    def all_categories_scanned(self) -> Expectation:
        failures = [
            f"{d.relative_path}: {u.label} ({u.reason})"
            for d in self.report.documents
            for u in (d.sensitive.unscanned_categories if d.sensitive else [])
        ]
        return self._check("every identifier category to be scanned", failures)

    def no_regressions(
        self, baseline: AuditReport | str | os.PathLike[str], *, score_tolerance: float = 0.5
    ) -> Expectation:
        """Nothing worse than in `baseline`, a report or a path to its JSON."""
        old = baseline if isinstance(baseline, AuditReport) else load_report(baseline)
        changes = diff_reports(old, self.report, score_tolerance=score_tolerance)
        failures = [line for line in changes.summary().splitlines() if line.startswith("[worse]")]
        return self._check("no regressions from the baseline", failures)

    def _loader_values(self, attribute: str) -> list[tuple[str, Any]]:
        comparison = self.report.loader_comparison
        rows: list[Any] = list(comparison.loaders) if comparison is not None else []
        if not rows and self.report.loader is not None:
            rows = [self.report.loader]
        return [(row.name, value) for row in rows for value in getattr(row, attribute)]
