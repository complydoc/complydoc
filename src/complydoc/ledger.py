"""Where a value went: every document, pipeline stage and host a given identifier reached,
and for a vector store, the IDs of the items holding it, to delete for an erasure request.

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

import dataclasses
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
    ids: list[str] = field(default_factory=list)
    """For a vector store, the IDs of the stored items holding the value."""
    withheld: int = 0
    """Items holding the value whose ID was itself a path or an identifier, so the report
    does not carry it: they are counted, and found by their content instead."""
    store: str | None = None
    """For a vector store, the collection or index it named, where its settings say."""
    delete: str | None = None
    """For a vector store whose IDs are known, the call that removes those items."""

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


_STORE_KEYS = ("collection_name", "index_name", "table_name", "namespace", "persist_directory")
"""Settings a vector store names where it keeps its items under, most telling first."""


def _stored(stage: dict[str, Any], found: list[dict[str, Any]]) -> tuple[list[str], int]:
    """The IDs of the stored items holding the value, and how many more were withheld."""
    ids = [str(i) for i in stage.get("ids") or []]
    positions = sorted({p for i in found for p in i.get("items") or [] if 0 <= p < len(ids)})
    named = [ids[p] for p in positions if ids[p]]
    return list(dict.fromkeys(named)), len(positions) - len(named)


def _step_sightings(trace: dict[str, Any], wanted: set[str]) -> list[StepSighting]:
    steps: list[StepSighting] = []
    last: tuple[Any, ...] | None = None
    for stage in trace.get("stages") or []:
        if stage.get("parent") is not None:
            continue
        found = [i for i in stage.get("identifiers") or [] if i.get("fingerprint") in wanted]
        held = sum(int(identifier.get("occurrences") or 1) for identifier in found)
        hosts = list(stage.get("hosts") or [])
        ids, withheld = _stored(stage, found)
        parameters = stage.get("parameters") or {}
        store = None
        if stage.get("kind") == "store":
            store = next((str(parameters[k]) for k in _STORE_KEYS if parameters.get(k)), None)
        # Two collections are two places to delete from, however alike the calls.
        same = (stage.get("kind"), stage.get("component"), stage.get("method"), store)
        if steps and same == last:
            before = steps[-1]
            ids = list(dict.fromkeys([*before.ids, *ids]))
            steps[-1] = dataclasses.replace(
                before,
                calls=before.calls + 1,
                occurrences=before.occurrences + held,
                hosts=list(dict.fromkeys([*before.hosts, *hosts])),
                ids=ids,
                withheld=before.withheld + withheld,
                delete=_delete_call(stage, ids),
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
                    ids=ids,
                    withheld=withheld,
                    store=store,
                    delete=_delete_call(stage, ids),
                )
            )
        last = same
    return steps


_LLAMA_INDEX_ADDS = ("add", "async_add")
"""What a LlamaIndex vector store is given its nodes by; LangChain's are named otherwise."""


def _delete_call(stage: dict[str, Any], ids: list[str]) -> str | None:
    """The call that removes these items from the store, as the store's framework writes it."""
    if stage.get("kind") != "store" or not ids:
        return None
    if stage.get("method") in _LLAMA_INDEX_ADDS:
        return f"vector_store.delete_nodes(node_ids={ids!r})"
    return f"vector_store.delete(ids={ids!r})"


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
