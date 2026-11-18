"""What the MCP server tells an engineer about the runs complydoc already recorded.

A pipeline observed with `cd.observe`, a loader comparison and an audit each leave a report
in `.complydoc`. These tools read them: which runs there are, where a pipeline spent its
time, how loaders compared, whether evals passed, where a value went. Nothing is run from
the conversation, and reports hold only masked values, so what reaches the model is the
same as what the viewer shows.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from complydoc.report.models import AuditReport, LoaderComparison, StageIdentifier, Trace
    from complydoc.viewer.server import FoundReport

__all__ = ["RunError", "Runs"]

MAX_RUNS = 50

NO_RUNS = (
    "No complydoc runs were found in {where}. A pipeline run inside `cd.observe(...)`, "
    "`complydoc compare-loaders` and `complydoc audit` each write one."
)


class RunError(Exception):
    """A run asked for that is not there, said in words the assistant can pass on."""


@dataclass(frozen=True, slots=True)
class _Run:
    found: FoundReport
    report: AuditReport

    @property
    def kind(self) -> str:
        if self.report.trace is not None and self.report.trace.kind == "pipeline":
            return "pipeline"
        if self.report.loader_comparison is not None:
            return "loader comparison"
        return "audit"

    @property
    def title(self) -> str:
        trace = self.report.trace
        return trace.name if trace is not None and trace.kind == "pipeline" else self.found.name

    @property
    def label(self) -> str:
        """Its kind, and its name when the file is called something else."""
        return self.kind if self.title == self.found.name else f"{self.kind} {self.title!r}"

    @property
    def when(self) -> str:
        return self.report.run.started_at[:16].replace("T", " ")

    @property
    def commit(self) -> str | None:
        context = self.report.run.context
        return getattr(context, "commit", None) if context is not None else None


def _seconds(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value * 1000:.0f} ms" if value < 1 else f"{value:.2f} s"


class Runs:
    """The reports in `sources`, read when asked for, newest first."""

    def __init__(self, sources: list[Path]) -> None:
        self.sources = [Path(source).expanduser() for source in sources]

    def _where(self) -> str:
        return ", ".join(str(source) for source in self.sources)

    def _all(self) -> list[_Run]:
        from complydoc.report.json_reader import load_report
        from complydoc.viewer.server import find_reports

        runs = []
        for found in find_reports(*[s for s in self.sources if s.exists()]):
            try:
                runs.append(_Run(found, load_report(found.path)))
            except (OSError, ValueError, TypeError, KeyError):
                continue  # One report this version cannot read must not hide the rest.
        return sorted(runs, key=lambda r: r.report.run.started_at, reverse=True)

    def _one(self, name: str) -> tuple[_Run, list[_Run]]:
        runs = self._all()
        if not runs:
            raise RunError(NO_RUNS.format(where=self._where()))
        wanted = name.strip().lower()
        if wanted in ("", "latest", "last"):
            return runs[0], runs
        exact = [r for r in runs if wanted in (r.found.name.lower(), r.title.lower())]
        if exact:
            return exact[0], runs  # The newest run of that name.
        partial = [r for r in runs if wanted in r.found.name.lower() or wanted in r.title.lower()]
        if not partial:
            raise RunError(f"No run called {name!r}. list_runs gives their names.")
        return partial[0], runs

    # The tools.
    def list_runs(self, query: str = "") -> str:
        runs = self._all()
        if not runs:
            return NO_RUNS.format(where=self._where())
        wanted = query.strip().lower()
        if wanted:
            runs = [r for r in runs if wanted in r.found.name.lower() or wanted in r.title.lower()]
            if not runs:
                return f"No run matching {query!r}."
        lines = []
        for run in runs[:MAX_RUNS]:
            commit = f", commit {run.commit[:7]}" if run.commit else ""
            documents = len(run.report.documents)
            lines.append(
                f"- {run.found.name}: {run.label}, {run.when}{commit}, "
                f"{_seconds(run.report.run.duration_seconds)}, {documents} documents"
            )
        more = len(runs) - MAX_RUNS
        tail = f"\n…and {more} older; narrow it with a word from the name." if more > 0 else ""
        return "Newest first:\n" + "\n".join(lines) + tail

    def show_run(self, name: str = "") -> str:
        run, _ = self._one(name)
        report = run.report
        commit = f", commit {run.commit[:7]}" if run.commit else ""
        parts = [f"{run.found.name}: {run.label}, {run.when}{commit}."]
        if report.trace is not None and report.trace.kind == "pipeline":
            parts.append(_trace(report.trace))
        if report.loader_comparison is not None:
            parts.append(_loaders(report.loader_comparison))
        if report.evals is not None and report.evals.checks:
            parts.append(_evals(report))
        if run.kind == "audit":
            parts.append(_audit(report))
        return "\n\n".join(parts)

    def compare_runs(self, name: str = "", against: str = "") -> str:
        run, runs = self._one(name)
        if run.kind != "pipeline" or run.report.trace is None:
            raise RunError(f"{run.found.name} is not a pipeline run; only those have step times.")
        if against.strip():
            other, _ = self._one(against)
        else:
            # Runs are newest first, so the earlier ones of the same pipeline come after it.
            after = runs[runs.index(run) + 1 :]
            earlier = [r for r in after if r.kind == "pipeline" and r.title == run.title]
            if not earlier:
                raise RunError(f"There is no earlier run of {run.title!r} to compare it with.")
            other = earlier[0]
        if other.report.trace is None:
            raise RunError(f"{other.found.name} is not a pipeline run; only those have step times.")
        return _compared(run, other)

    def find_value(self, value: str) -> str:
        from complydoc.ledger import find_value

        if not value.strip():
            raise RunError("Give the value to look for, such as an IBAN or an email address.")
        trail = find_value(value, *[s for s in self.sources if s.exists()])
        if not trail.runs:
            return f"That value is in none of the {trail.reports_searched} reports searched."
        lines = [
            f"{trail.label}  {trail.masked}  in {len(trail.runs)} of "
            f"{trail.reports_searched} reports"
        ]
        for sighting in trail.runs:
            commit = f", commit {sighting.commit[:7]}" if sighting.commit else ""
            when = sighting.started_at[:16].replace("T", " ")
            lines.append(f"\n{sighting.name}: {sighting.kind}, {when}{commit}")
            for document in sighting.documents:
                pages = ", ".join(str(p) for p in document.pages)
                lines.append(f"  read from {document.path}" + (f", page {pages}" if pages else ""))
            for step in sighting.steps:
                if step.occurrences:
                    hosts = f" → {', '.join(step.hosts)}" if step.hosts else ""
                    lines.append(
                        f"  step {step.step} {step.component} ({step.kind}) still held it{hosts}"
                    )
            if sighting.sent_to:
                lines.append(f"  sent to {', '.join(sighting.sent_to)}")
        return "\n".join(lines)


def _trace(trace: Trace) -> str:
    lines = [
        f"Pipeline took {_seconds(trace.seconds)}; complydoc's own scanning added "
        f"{_seconds(trace.overhead_seconds)}."
    ]
    for number, stage in enumerate(trace.stages, 1):
        if stage.documents_in:
            flow = f", {stage.documents_in} → {stage.documents_out or 0} documents"
        elif stage.documents_out:
            flow = f", {stage.documents_out} documents out"
        else:
            flow = ""
        characters = f", {stage.characters_out:,} characters out" if stage.characters_out else ""
        held = _identifiers(stage.identifiers)
        hidden = f"; {stage.hidden} hidden passages" if stage.hidden else ""
        # A step called inside another is its part: shown under it, its time already counted.
        inside = "   inside the step above: " if stage.parent is not None else ""
        lines.append(
            f"{inside}{number}. {stage.component} ({stage.kind}): {_seconds(stage.seconds)}"
            f"{flow}{characters}{held}{hidden}"
        )
    outermost = [stage for stage in trace.stages if stage.parent is None]
    if outermost:
        slowest = max(outermost, key=lambda stage: stage.seconds)
        share = slowest.seconds / trace.seconds * 100 if trace.seconds else 0
        lines.append(f"Slowest: {slowest.component}, {share:.0f}% of the time.")
    if trace.connections_outside:
        lines.append("Sent outside this machine: " + ", ".join(trace.connections_outside) + ".")
    else:
        lines.append("Nothing was sent outside this machine.")
    if trace.error:
        lines.append(f"The pipeline failed: {trace.error}")
    return "\n".join(lines)


def _identifiers(found: list[StageIdentifier]) -> str:
    """What a step passed on, added up by kind, the most frequent first."""
    if not found:
        return ""
    counts: dict[str, int] = {}
    for identifier in found:
        counts[identifier.label] = counts.get(identifier.label, 0) + identifier.occurrences
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])
    shown = ", ".join(f"{label} x{count}" for label, count in ranked[:4])
    rest = len(ranked) - 4
    more = f" and {rest} more kind{'s' if rest > 1 else ''}" if rest > 0 else ""
    return f"; passed on {shown}{more}"


def _loaders(comparison: LoaderComparison) -> str:
    facts = len(comparison.facts)
    lines = [f"Loaders, the first one the baseline ({comparison.baseline}):"]
    fastest = min(
        (row for row in comparison.loaders if row.seconds is not None and not row.error),
        key=lambda row: row.seconds or 0.0,
        default=None,
    )
    for row in comparison.loaders:
        if row.error:
            lines.append(f"- {row.name}: failed, {row.error}")
            continue
        kept = (
            f", {row.facts_found}/{facts} facts kept"
            if facts and row.facts_found is not None
            else ""
        )
        network = (
            f", tried to reach {', '.join(row.network_attempts)}" if row.network_attempts else ""
        )
        lines.append(
            f"- {row.name}: {_seconds(row.seconds)}, {row.documents} documents, {row.pages} pages, "
            f"{row.characters:,} characters{kept}, {row.identifiers_in_text} identifiers in the "
            f"text{network}"
        )
    if fastest is not None:
        lines.append(f"Fastest: {fastest.name}.")
    if comparison.recommended:
        lines.append(f"Recommended: {comparison.recommended}. {comparison.verdict}".strip())
    return "\n".join(lines)


def _evals(report: AuditReport) -> str:
    evals = report.evals
    assert evals is not None
    readers = evals.readers or sorted({r for check in evals.checks for r in check.found})
    total = len(evals.checks)
    lines = [f"Evals from {evals.file}, {total} facts:"]
    for reader in readers:
        missed = [check.fact for check in evals.checks if not check.found.get(reader)]
        tail = f"; missing: {'; '.join(missed[:5])}" if missed else ""
        lines.append(f"- {reader}: {total - len(missed)}/{total} kept{tail}")
    return "\n".join(lines)


def _audit(report: AuditReport) -> str:
    aggregate = report.aggregate
    if aggregate is None:
        return f"{len(report.documents)} documents audited."
    lines = [
        f"{aggregate.documents_audited} documents audited, {aggregate.documents_skipped} skipped, "
        f"{aggregate.pages_total} pages ({aggregate.pages_unreadable} unreadable)."
    ]
    if aggregate.sensitive_total:
        found = ", ".join(
            f"{category} {count}"
            for category, count in sorted(
                aggregate.sensitive_by_category.items(), key=lambda kv: -kv[1]
            )
        )
        lines.append(
            f"{aggregate.sensitive_total} identifiers in {aggregate.documents_with_sensitive_data} "
            f"documents: {found}."
        )
    if aggregate.mean_readiness_score is not None:
        lines.append(f"Mean readiness score {aggregate.mean_readiness_score:.0f}/100.")
    return "\n".join(lines)


def _compared(run: _Run, other: _Run) -> str:
    now, before = run.report.trace, other.report.trace
    assert now is not None and before is not None
    earlier: dict[str, float] = {}
    for stage in (s for s in before.stages if s.parent is None):
        earlier[stage.component] = earlier.get(stage.component, 0.0) + stage.seconds
    later: dict[str, float] = {}
    for stage in (s for s in now.stages if s.parent is None):
        later[stage.component] = later.get(stage.component, 0.0) + stage.seconds
    lines = [
        f"{run.found.name} ({run.when}) against {other.found.name} ({other.when}):",
        f"Total {_seconds(now.seconds)}, was {_seconds(before.seconds)} "
        f"({_change(now.seconds, before.seconds)}).",
    ]
    for component in list(dict.fromkeys([*later, *earlier])):
        if component not in earlier:
            lines.append(f"- {component}: {_seconds(later[component])}, new in this run")
        elif component not in later:
            lines.append(f"- {component}: gone, was {_seconds(earlier[component])}")
        else:
            lines.append(
                f"- {component}: {_seconds(later[component])}, was "
                f"{_seconds(earlier[component])} ({_change(later[component], earlier[component])})"
            )
    return "\n".join(lines)


def _change(now: float, before: float) -> str:
    if before <= 0:
        return "no earlier time"
    percent = (now - before) / before * 100
    if abs(percent) < 5:
        return "about the same"
    return f"{abs(percent):.0f}% {'slower' if percent > 0 else 'faster'}"
