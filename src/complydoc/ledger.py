"""Where a value went: every document, pipeline stage and host a given identifier reached.

    trail = cd.find_value("PT50 0002 0123 1234 5678 9015 4", ".complydoc")
    for run in trail.runs:
        print(run.name, run.documents, run.sent_to)

Reports do not hold the values they found, only each one's fingerprint: a hash of its
category and its characters. To ask where a value went, the value is hashed the same
way and the reports are searched for the hash. So the question can be asked of a pile of
reports that never held the value, and the value asked about is not written anywhere.

A fingerprint is not a secret: a value with few possibilities can be recovered from one
by trying them all. See `complydoc.fingerprint`.

It reads the reports in a folder, on this machine.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from complydoc.config.loader import load_config
from complydoc.config.schema import Config
from complydoc.fingerprint import identifier_fingerprint

__all__ = ["DocumentSighting", "RunSighting", "StepSighting", "Trail", "find_value"]


@dataclass(frozen=True, slots=True)
class DocumentSighting:
    path: str
    pages: list[int]
    occurrences: int


@dataclass(frozen=True, slots=True)
class StepSighting:
    """A step of a pipeline, and whether what it passed on still held the value.

    A step is what the trace shows as one: calls one after another of the same component,
    as a loader called once a file. Every step of the run is listed, the ones that never
    held the value too, since where it stopped is as much the answer as where it went.
    """

    step: int
    kind: str
    component: str
    calls: int
    occurrences: int
    """How many times the value was in what the step passed on, or for an embedding step
    sent. Zero where it was not."""
    hosts: list[str] = field(default_factory=list)
    """Where the step sent what it was given, when it sent it anywhere."""

    @property
    def held(self) -> bool:
        return self.occurrences > 0


@dataclass(frozen=True, slots=True)
class RunSighting:
    """One run in which the value was found."""

    report: str
    """The report file, as the viewer names it."""
    name: str
    """The pipeline's name, or the folder audited."""
    kind: str
    """`pipeline` for a traced run, else `audit`."""
    started_at: str
    commit: str | None
    documents: list[DocumentSighting]
    steps: list[StepSighting]
    """Every step of a traced run, in order. Empty for an audit."""
    reached: int | None
    """The last step that held the value. None when no step did, as in an audit."""
    sent_to: list[str]
    """Every host a step holding the value sent its input to."""


@dataclass(frozen=True, slots=True)
class Trail:
    """Everywhere a value was found, newest run first."""

    label: str | None
    """What kind of identifier it was found as, such as `IBAN`. None when not found."""
    masked: str | None
    """The value as reports show it."""
    fingerprints: list[str]
    runs: list[RunSighting]
    reports_searched: int

    @property
    def found(self) -> bool:
        return bool(self.runs)

    def to_dict(self) -> dict[str, Any]:
        from dataclasses import asdict

        return {**asdict(self), "found": self.found}


def candidate_fingerprints(value: str, config: Config) -> set[str]:
    """What `value` would be called as each kind of identifier, or itself if it is a fingerprint."""
    value = value.strip()
    if value.startswith("id-") and len(value) == 19:
        return {value}
    return {identifier_fingerprint(category, value) for category in config.sensitive.categories}


def _step_sightings(trace: dict[str, Any], wanted: set[str]) -> list[StepSighting]:
    steps: list[StepSighting] = []
    last: tuple[Any, Any, Any] | None = None
    for stage in trace.get("stages") or []:
        if stage.get("parent") is not None:
            continue
        held = sum(
            int(identifier.get("occurrences") or 1)
            for identifier in stage.get("identifiers") or []
            if identifier.get("fingerprint") in wanted
        )
        hosts = list(stage.get("hosts") or [])
        same = (stage.get("kind"), stage.get("component"), stage.get("method"))
        if steps and same == last:
            before = steps[-1]
            steps[-1] = StepSighting(
                before.step,
                before.kind,
                before.component,
                before.calls + 1,
                before.occurrences + held,
                list(dict.fromkeys([*before.hosts, *hosts])),
            )
        else:
            steps.append(
                StepSighting(
                    len(steps) + 1,
                    str(stage.get("kind") or ""),
                    str(stage.get("component") or ""),
                    1,
                    held,
                    hosts,
                )
            )
        last = same
    return steps


def _folder(target: Any) -> str:
    """The folder a run read, by its own name: where it sits on a disk is not its name."""
    return Path(str(target)).name if target else ""


def _in_report(data: dict[str, Any], name: str, wanted: set[str]) -> tuple[RunSighting, Any] | None:
    documents: list[DocumentSighting] = []
    described: Any = None
    for document in data.get("documents") or []:
        matches = [
            match
            for match in ((document.get("sensitive") or {}).get("matches") or [])
            if match.get("fingerprint") in wanted
        ]
        if matches:
            described = described or matches[0]
            pages = sorted({int(m["page"]) for m in matches if m.get("page") is not None})
            documents.append(
                DocumentSighting(str(document.get("relative_path") or ""), pages, len(matches))
            )
    trace = data.get("trace") or {}
    pipeline = bool(trace) and trace.get("kind") != "audit"
    steps = _step_sightings(trace, wanted) if pipeline else []
    holding = [step for step in steps if step.held]
    if not documents and not holding:
        return None
    if described is None:
        described = next(
            identifier
            for stage in trace.get("stages") or []
            for identifier in stage.get("identifiers") or []
            if identifier.get("fingerprint") in wanted
        )
    run = data.get("run") or {}
    sighting = RunSighting(
        report=name,
        name=str((trace.get("name") if pipeline else None) or _folder(run.get("target")) or name),
        kind="pipeline" if pipeline else "audit",
        started_at=str(run.get("started_at") or ""),
        commit=((run.get("context") or {}).get("commit") or None),
        documents=documents,
        steps=steps,
        reached=holding[-1].step if holding else None,
        sent_to=list(dict.fromkeys(host for step in holding for host in step.hosts)),
    )
    return sighting, described


def find_value(value: str, *sources: str | Path, config: Config | None = None) -> Trail:
    """Everywhere `value` was found in the reports in `sources`, `.complydoc` when none is given.

    `value` is an identifier as it is written, such as an account number or a name, or a
    finding's fingerprint. Spacing, dashes and case do not matter.
    """
    from complydoc.viewer.server import find_reports

    wanted = candidate_fingerprints(value, config or load_config())
    reports = find_reports(*sources)
    runs: list[RunSighting] = []
    label = masked = None
    matched: set[str] = set()
    for report in reports:
        # A report this cannot make sense of, such as one from a much older version, is
        # passed over: one of them must not hide the value in all the others.
        try:
            data = json.loads(report.path.read_text(encoding="utf-8"))
            found = _in_report(data, report.name, wanted) if isinstance(data, dict) else None
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            continue
        if found is None:
            continue
        sighting, described = found
        runs.append(sighting)
        label = label or described.get("label")
        masked = masked or described.get("masked")
        matched.add(str(described.get("fingerprint")))
    runs.sort(key=lambda run: run.started_at, reverse=True)
    return Trail(label, masked, sorted(matched), runs, len(reports))
