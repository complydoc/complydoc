"""Turning a finished block's recordings into a report, and writing it.

The documents loaded in the block are audited as `inspect_documents` audits a
loader's output, so the Security, Documents and Cost pages work on a trace as on
any run. Each splitter's chunks are inspected as `inspect_chunks` inspects them.
Every stage's output is scanned for identifiers, so a value can be followed from
the loader to what an embedding model was sent.
"""

from __future__ import annotations

import contextlib
import dataclasses
import datetime as dt
import os
import re
import time
from collections.abc import Iterable
from pathlib import Path, PurePath
from typing import TYPE_CHECKING, Any

from complydoc import offline
from complydoc.audit.run import COMPONENTS
from complydoc.config.loader import load_config
from complydoc.config.schema import Config
from complydoc.extraction.chunks import ChunkReport, inspect_chunks
from complydoc.extraction.strings import find_hidden
from complydoc.loaders.inspection import (
    ABSOLUTE_PATH,
    SOURCE_KEYS,
    document_content,
    finish_report,
    inspect_run,
)
from complydoc.observe.measure import Measurer
from complydoc.observe.quality import warnings_for
from complydoc.report.chunk_run import chunk_run_report
from complydoc.report.json_writer import write_json
from complydoc.report.models import (
    AuditReport,
    Limitation,
    StageDocument,
    StageIdentifier,
    Trace,
    TraceStage,
)
from complydoc.sensitive.base import SensitiveMatch
from complydoc.sensitive.scanner import scan_text
from complydoc.utils.text import count

if TYPE_CHECKING:
    from complydoc.observe.session import Observation, Recording

__all__ = ["build_report", "summary_lines", "write_trace"]

_HOST = re.compile(r"DNS lookup of '([^']+)'")
_ADDRESS = re.compile(r"connect(?:_ex)? to \('([^']+)'")
_PACKAGES = re.compile(r'"[^"\n]*[\\/](?:site|dist)-packages[\\/]')
_TRACEBACK_LINES = 60


def build_report(
    observation: Observation, *, seconds: float, connections: list[str], error: str | None
) -> AuditReport:
    """The report of the block: its documents, its chunks, and the trace of its stages."""
    started = time.perf_counter()
    settings = observation.config or load_config()
    patterns = _patterns_only(settings)
    recordings = list(observation.recordings)
    top = [r for r in recordings if r.parent is None]
    last = top[-1].index if top else -1

    def config_for(recording: Recording) -> Config | None:
        """The name model reads the documents loaded, what was sent or stored, and the last
        stage; patterns the rest."""
        if observation.scan == "off":
            return None
        if observation.scan == "full" or recording.kind in ("load", "embed", "store"):
            return settings
        return settings if recording.index == last else patterns

    report = _documents_report(observation, recordings, settings)
    root = Path(report.run.target) if Path(report.run.target).is_absolute() else None
    previews = observation.previews if observation.scan != "off" else 0
    measurer = Measurer(settings, reveal=observation.reveal, previews=previews, root=root)

    chunk_reports: list[ChunkReport] = []
    chunk_index: dict[int, int] = {}
    for recording in _outermost(recordings, "split"):
        if recording.outputs:
            chunk_index[recording.index] = len(chunk_reports)
            chunk_reports.append(_chunks(recording, config_for(recording) or patterns))
    if chunk_reports:
        report.chunks = chunk_reports

    loads = [r for r in _outermost(recordings, "load") if r.outputs]
    # A directory loader passes on what the loader it runs for each file did; the warnings
    # are that loader's.
    directories = {r.parent for r in recordings if r.kind == "load" and r.parent is not None}
    scans = _Scans()
    origin: dict[str, str] = {}
    stages = []
    for recording in recordings:
        config = config_for(recording)
        from_report = len(loads) == 1 and recording is loads[0] and config is settings
        chunks = chunk_index.get(recording.index)
        stage = _stage(
            recording,
            config,
            observation.reveal,
            root,
            scans,
            chunks,
            report if from_report else None,
            measurer,
        )
        stages.append(
            _followed(
                stage,
                recording,
                _Context(config, observation.reveal, root, scans, measurer, origin),
                chunks=chunk_reports[chunks] if chunks is not None else None,
                report=report if from_report else None,
                warn=recording.index not in directories,
            )
        )

    in_stages = {c for stage in stages for c in stage.connections}
    unscanned = _unscanned(settings, scans, measurer, report)
    trace = Trace(
        name=observation.name,
        scan=observation.scan,
        seconds=round(seconds, 3),
        overhead_seconds=0.0,
        stages=stages,
        connections_outside=[c for c in connections if c not in in_stages],
        libraries=observation.libraries,
        error=error,
        unscanned=unscanned,
    )
    report.limitations[:0] = _limitations(trace)
    sent_to = sorted({host for stage in stages for host in stage.hosts})
    finished_at = observation.started_at + dt.timedelta(seconds=seconds)
    report.run = dataclasses.replace(
        report.run,
        started_at=observation.started_at.isoformat(timespec="seconds"),
        finished_at=finished_at.isoformat(timespec="seconds"),
        duration_seconds=round(seconds, 3),
        content_sent_to=sorted({*report.run.content_sent_to, *sent_to}),
    )
    overhead = observation.overhead + time.perf_counter() - started
    report.trace = dataclasses.replace(trace, overhead_seconds=round(overhead, 3))
    return report


def _outermost(recordings: list[Recording], kind: str) -> list[Recording]:
    """Stages of `kind` not inside another of the same kind: a directory loader, not the
    loader it calls for each file, whose documents it returns as its own."""
    by_index = {r.index: r for r in recordings}

    def nested(recording: Recording) -> bool:
        parent = by_index.get(recording.parent) if recording.parent is not None else None
        while parent is not None:
            if parent.kind == kind:
                return True
            parent = by_index.get(parent.parent) if parent.parent is not None else None
        return False

    return [r for r in recordings if r.kind == kind and not nested(r)]


def _patterns_only(settings: Config) -> Config:
    """`settings` with the categories a model reads turned off."""
    categories = {
        key: category.model_copy(update={"enabled": False}) if category.model_backed else category
        for key, category in settings.sensitive.categories.items()
    }
    sensitive = settings.sensitive.model_copy(update={"categories": categories})
    return settings.model_copy(update={"sensitive": sensitive})


def _documents_report(
    observation: Observation, recordings: list[Recording], settings: Config
) -> AuditReport:
    """The documents loaded in the block, audited; or, if none were, a report without them.

    Where nothing was loaded inside the block, what the first stage was given stands for
    the documents.
    """
    loads = [r for r in _outermost(recordings, "load") if r.outputs]
    documents = [item for r in loads for item in r.outputs or []]
    if not documents:
        given = next(
            (r.inputs for r in recordings if r.kind not in ("embed", "store") and r.inputs), None
        )
        documents = [item for item in given or [] if not isinstance(item, str)]
    if not documents:
        return chunk_run_report(
            [],
            Path.cwd(),
            settings,
            started_at=observation.started_at,
            started=time.monotonic(),
        )

    components = COMPONENTS if observation.scan != "off" else ("cost", "readiness")
    names = list(dict.fromkeys(r.component for r in loads)) or ["documents"]
    inspection = inspect_run(
        documents,
        name=", ".join(names),
        config=settings,
        components=components,
        reveal=observation.reveal,
        extracted_text=observation.extracted_text,
        models=observation.models,
        allow_network=False,
    )
    report = finish_report(inspection)
    if report.loader is not None and loads:
        report.loader = dataclasses.replace(
            report.loader,
            seconds=round(sum(r.seconds for r in loads), 3),
            tags=list(dict.fromkeys(tag for r in loads for tag in r.tags)),
        )
    return report


_SHAPING = ("chunk_size", "chunk_overlap")
"""Settings named with a splitter's chunks, as `complydoc chunks` names them, so two runs'
splitters are told apart."""


def _chunks(recording: Recording, config: Config) -> ChunkReport:
    outputs = list(recording.outputs or [])
    settings = [f"{k}={recording.parameters[k]}" for k in _SHAPING if k in recording.parameters]
    name = " ".join([recording.component, *settings])
    if recording.inputs is None or all(isinstance(item, str) for item in recording.inputs):
        return inspect_chunks(outputs, name=name, config=config)
    # The splitter has run: the report is of what it returned, not of a second run.
    return inspect_chunks(lambda _documents: outputs, recording.inputs, name=name, config=config)


def _stage(
    recording: Recording,
    config: Config | None,
    reveal: bool,
    root: Path | None,
    scans: _Scans,
    chunks: int | None,
    report: AuditReport | None,
    measurer: Measurer,
) -> TraceStage:
    # An embedding call or a vector store passes nothing on: what it was given is what left.
    sends = recording.kind in ("embed", "store")
    given = _contents(recording.inputs)
    passed = _contents(recording.inputs if sends else recording.outputs)
    texts = [text for text, _ in passed]
    tokens_in = measurer.tokens([t for t, _ in given]) if recording.inputs is not None else None
    tokens_out = None if sends or recording.outputs is None else measurer.tokens(texts)
    usd, basis = measurer.cost(recording, tokens_in)

    if config is None:
        identifiers: list[StageIdentifier] = []
        hidden = None
    else:
        matches = _report_matches(report) if report is not None else None
        if matches is None:
            matches = [m for text in texts for m in scans.matches(text, config, reveal)]
        identifiers = _by_fingerprint(matches)
        hidden = sum(scans.hidden(text, config) for text in texts)
        if report is not None:
            scans.unavailable.update(_audit_unscanned(report))

    keys_out = sorted({key for _, metadata in passed for key in metadata})
    keys_in = {key for _, metadata in given for key in metadata}
    return TraceStage(
        index=recording.index,
        kind=recording.kind,
        component=recording.component,
        module=recording.module,
        method=recording.method,
        seconds=round(recording.seconds, 4),
        tags=recording.tags,
        parameters=recording.parameters,
        documents_in=len(given) if recording.inputs is not None else None,
        documents_out=None if sends or recording.outputs is None else len(recording.outputs),
        characters_in=sum(len(t) for t, _ in given) if recording.inputs is not None else None,
        characters_out=None if sends or recording.outputs is None else sum(map(len, texts)),
        sources=_sources(passed, root),
        scanned=_scanned(config, scans.unavailable),
        identifiers=identifiers,
        hidden=hidden,
        metadata_keys=keys_out,
        metadata_keys_added=[key for key in keys_out if key not in keys_in] if given else [],
        path_keys=sorted(
            {
                key
                for _, metadata in passed
                for key, value in metadata.items()
                if isinstance(value, str) and ABSOLUTE_PATH.match(value)
            }
        ),
        connections=list(dict.fromkeys(recording.connections)),
        hosts=_hosts(recording.connections),
        vectors=recording.vectors,
        dimensions=recording.dimensions,
        chunks=chunks,
        parent=recording.parent,
        started=recording.started,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        usd=usd,
        usd_basis=basis,
        previews=measurer.preview(passed) if config is not None else [],
        finished=recording.finished,
        error=recording.error,
    )


@dataclasses.dataclass(frozen=True, slots=True)
class _Context:
    """What following each stage's documents needs, the same for every stage."""

    config: Config | None
    reveal: bool
    root: Path | None
    scans: _Scans
    measurer: Measurer
    origin: dict[str, str]
    """The document each text came from, as the stages before named it: an embedding call
    is given bare texts, which are known by the chunks they were."""


def _followed(
    stage: TraceStage,
    recording: Recording,
    context: _Context,
    *,
    chunks: ChunkReport | None,
    report: AuditReport | None,
    warn: bool,
) -> TraceStage:
    """`stage` with what it did to each document, what was wrong with what it passed on,
    and where it raised."""
    sends = recording.kind in ("embed", "store")
    passed = _contents(recording.inputs if sends else recording.outputs)
    items = []
    for text, metadata in passed:
        source = _source(metadata, context.root) or context.origin.get(text)
        if source:
            context.origin.setdefault(text, source)
        items.append((text, source))
    config = context.config if stage.scanned != "off" else None
    warnings = (
        warnings_for(
            recording.kind,
            items,
            chunks=chunks,
            model=Measurer.model(recording),
            tokens=lambda text: context.measurer.tokens([text]),
        )
        if warn
        else []
    )
    return dataclasses.replace(
        stage,
        documents=_documents(items, config, context, report),
        warnings=warnings,
        traceback=_traceback(recording.traceback, context) if recording.traceback else None,
    )


def _documents(
    items: list[tuple[str, str | None]],
    config: Config | None,
    context: _Context,
    report: AuditReport | None,
) -> list[StageDocument]:
    grouped: dict[str, list[str]] = {}
    for text, source in items:
        if source:
            grouped.setdefault(source, []).append(text)
    audited = _audited(report) if report is not None and config is not None else None
    documents = []
    for source, texts in grouped.items():
        if config is None:
            found: list[str] = []
        elif audited is not None:
            found = _lookup(audited, source)
        else:
            matches = (m for t in texts for m in context.scans.matches(t, config, context.reveal))
            found = list(dict.fromkeys(_key(m) for m in matches))
        documents.append(
            StageDocument(
                source=source,
                items=len(texts),
                characters=sum(map(len, texts)),
                empty=sum(1 for t in texts if not t.strip()),
                identifiers=found,
            )
        )
    return documents


def _audited(report: AuditReport) -> dict[str, list[str]]:
    """Each audited document's identifiers, by its path: the loader's documents were
    scanned by the audit, and are not scanned again."""
    return {
        d.relative_path: list(dict.fromkeys(_key(m) for m in d.sensitive.matches))
        for d in report.documents
        if d.sensitive is not None
    }


def _lookup(audited: dict[str, list[str]], source: str) -> list[str]:
    if source in audited:
        return audited[source]
    name = PurePath(source).name
    return next(
        (
            found
            for path, found in audited.items()
            if path.endswith(source) or source.endswith(path) or PurePath(path).name == name
        ),
        [],
    )


def _traceback(text: str, context: _Context) -> str:
    """The last lines of a traceback, with the account's folders and the installed
    packages' paths cut, and identifiers in the error's message masked."""
    home = str(Path.home())
    lines = []
    for line in text.splitlines()[-_TRACEBACK_LINES:]:
        line = _PACKAGES.sub('"', line)
        if context.root is not None:
            line = line.replace(str(context.root) + os.sep, "")
        lines.append(line.replace(home, "~"))
    return context.measurer.masked("\n".join(lines))


def _scanned(config: Config | None, unavailable: dict[str, str]) -> str:
    """How a stage was scanned: `full` only where a model-backed category actually ran."""
    if config is None:
        return "off"
    ran = [
        category_id
        for category_id, category in config.sensitive.enabled_categories.items()
        if category.model_backed and category_id not in unavailable
    ]
    return "full" if ran else "patterns"


def _audit_unscanned(report: AuditReport) -> dict[str, str]:
    return {
        c.category: c.reason
        for d in report.documents
        if d.sensitive is not None
        for c in d.sensitive.unscanned_categories
    }


def _unscanned(
    settings: Config, scans: _Scans, measurer: Measurer, report: AuditReport
) -> dict[str, str]:
    """The kinds of identifier the run could not look for, by label, with why."""
    found = {**_audit_unscanned(report), **measurer.unscanned, **scans.unavailable}
    categories = settings.sensitive.categories
    return {(categories[c].label if c in categories else c): reason for c, reason in found.items()}


def _contents(items: list[Any] | None) -> list[tuple[str, dict[str, Any]]]:
    contents = []
    for item in items or []:
        try:
            contents.append(document_content(item))
        except TypeError:
            continue
    return contents


class _Scans:
    """Each distinct text scanned once per configuration, however many stages pass it on.

    A stage that leaves the text alone, such as one that only rewrites metadata, passes on
    exactly what it was given, so its scan is the previous stage's.
    """

    def __init__(self) -> None:
        self._matches: dict[tuple[str, int], list[SensitiveMatch]] = {}
        self._hidden: dict[tuple[str, int], int] = {}
        self.unavailable: dict[str, str] = {}
        """Categories that could not be looked for, by id, with why: a name model not
        installed, say."""

    def matches(self, text: str, config: Config, reveal: bool) -> list[SensitiveMatch]:
        key = (text, id(config))
        if key not in self._matches:
            with offline.guarded():
                self._matches[key], unavailable = scan_text(text, config.sensitive, reveal)
            self.unavailable.update(unavailable)
        return self._matches[key]

    def hidden(self, text: str, config: Config) -> int:
        """How many passages of `text` are hidden or instruction-like at medium or high."""
        key = (text, id(config))
        if key not in self._hidden:
            with offline.guarded():
                self._hidden[key] = sum(
                    1
                    for finding in find_hidden(text, config=config)
                    if finding.severity in ("medium", "high")
                )
        return self._hidden[key]


def _report_matches(report: AuditReport) -> list[SensitiveMatch] | None:
    """The documents' matches as the audit found them, where the audit scanned them."""
    if not report.documents or any(d.sensitive is None for d in report.documents):
        return None
    return [m for d in report.documents if d.sensitive for m in d.sensitive.matches]


def _key(match: SensitiveMatch) -> str:
    return match.fingerprint or f"{match.category}:{match.masked}"


def _by_fingerprint(matches: Iterable[SensitiveMatch]) -> list[StageIdentifier]:
    found: dict[str, StageIdentifier] = {}
    for match in matches:
        key = _key(match)
        seen = found.get(key)
        found[key] = (
            dataclasses.replace(seen, occurrences=seen.occurrences + 1)
            if seen
            else StageIdentifier(key, match.label, match.masked, match.severity, 1, match.evidence)
        )
    severity = {"high": 0, "medium": 1, "low": 2}
    return sorted(found.values(), key=lambda i: (severity.get(i.severity, 3), i.label, i.masked))


def _source(metadata: dict[str, Any], root: Path | None) -> str | None:
    """The document an item came from, as the report names it."""
    source = next((metadata[k] for k in SOURCE_KEYS if metadata.get(k)), None)
    if not isinstance(source, str | PurePath):
        return None
    path = Path(source)
    if root is not None and path.is_absolute():
        with contextlib.suppress(ValueError):
            path = path.relative_to(root)
    return str(path)


def _sources(contents: list[tuple[str, dict[str, Any]]], root: Path | None) -> list[str]:
    names = (_source(metadata, root) for _, metadata in contents)
    return list(dict.fromkeys(name for name in names if name))


def _hosts(connections: list[str]) -> list[str]:
    """The hosts looked up, or where nothing was looked up, the addresses connected to."""
    names = [m.group(1) for c in connections if (m := _HOST.search(c))]
    if names:
        return list(dict.fromkeys(names))
    return list(dict.fromkeys(m.group(1) for c in connections if (m := _ADDRESS.search(c))))


def _limitations(trace: Trace) -> list[Limitation]:
    limitations = []
    # A stage's connections include those of the stages inside it; each is said once, by
    # the innermost stage that made it.
    sending_inside = {s.parent for s in trace.stages if s.hosts and s.parent is not None}
    for stage in trace.stages:
        what = f"Stage {stage.index + 1}, {stage.component}"
        if stage.hosts and stage.index not in sending_inside:
            subject = (
                count(stage.documents_in or 0, "text")
                if stage.kind == "embed"
                else "what it was given"
            )
            held = (
                f", holding {count(len(stage.identifiers), 'identifier')},"
                if stage.identifiers
                else ""
            )
            limitations.append(
                Limitation(
                    area="Pipeline",
                    statement=f"{what}, sent {subject}{held} to {', '.join(stage.hosts)}.",
                    affected=stage.connections,
                    severity="important",
                )
            )
        if stage.error:
            limitations.append(
                Limitation(
                    area="Pipeline",
                    statement=f"{what}, raised {stage.error}.",
                    severity="important",
                )
            )
        if not stage.finished:
            limitations.append(
                Limitation(
                    area="Pipeline",
                    statement=(
                        f"{what}, was read lazily and not to the end before the block closed; "
                        f"it reports only what was taken from it."
                    ),
                    severity="info",
                )
            )
    if trace.unscanned:
        labels = " and ".join(trace.unscanned)
        reason = next(iter(trace.unscanned.values()))
        limitations.append(
            Limitation(
                area="Pipeline",
                statement=(
                    f"{labels} were not looked for, so they are neither counted nor masked in "
                    f"the trace's previews: {reason}"
                ),
                severity="important",
            )
        )
    if trace.connections_outside:
        limitations.append(
            Limitation(
                area="Pipeline",
                statement=(
                    f"{count(len(trace.connections_outside), 'connection')} were made in the "
                    f"block outside any stage complydoc observes."
                ),
                affected=trace.connections_outside,
                severity="info",
            )
        )
    if trace.error:
        limitations.append(
            Limitation(
                area="Pipeline",
                statement=f"The pipeline raised {trace.error}; the trace ends where it stopped.",
                severity="important",
            )
        )
    return limitations


def write_trace(report: AuditReport, out: Path, name: str, started_at: dt.datetime) -> Path:
    """Write the report as `<name>-<time>.json` in `out`, never over an earlier run."""
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-.") or "pipeline"
    stem = f"{slug}-{started_at.strftime('%Y%m%d-%H%M%S')}"
    path = out / f"{stem}.json"
    number = 2
    while path.exists():
        path = out / f"{stem}-{number}.json"
        number += 1
    return write_json(report, path)


def _steps(stages: list[TraceStage]) -> list[list[TraceStage]]:
    """Stages one after another of the same component and method, as one step each, the
    way a loader called once a file reads."""
    groups: list[list[TraceStage]] = []
    for stage in (s for s in stages if s.parent is None):
        last = groups[-1][-1] if groups else None
        same = last is not None and (last.kind, last.component, last.method) == (
            stage.kind,
            stage.component,
            stage.method,
        )
        if same:
            groups[-1].append(stage)
        else:
            groups.append([stage])
    return groups


def summary_lines(observation: Observation) -> list[str]:
    report = observation.report
    if report is None or report.trace is None:
        return [f"{observation.name}: not recorded ({observation.error or 'the block is open'})"]
    trace = report.trace
    lines = [
        f"{trace.name}: {count(len(_steps(trace.stages)), 'step')} in {trace.seconds:.2f} s; "
        f"observing took {trace.overhead_seconds:.2f} s"
    ]
    for number, group in enumerate(_steps(trace.stages), start=1):
        first = group[0]
        parts = []
        if first.kind == "embed":
            parts.append(f"{count(sum(s.documents_in or 0 for s in group), 'text')} embedded")
        elif first.kind == "store":
            parts.append(f"{count(sum(s.documents_in or 0 for s in group), 'document')} stored")
        elif first.documents_out is not None:
            parts.append(count(sum(s.documents_out or 0 for s in group), "document"))
        if first.scanned != "off":
            found = {i.fingerprint for s in group for i in s.identifiers}
            parts.append(count(len(found), "identifier"))
        hosts = list(dict.fromkeys(h for s in group for h in s.hosts))
        if hosts:
            parts.append("sent to " + ", ".join(hosts))
        parts.extend(f"raised {s.error}" for s in group if s.error)
        parts.extend(w.message for s in group for w in s.warnings)
        calls = f" ({len(group)} calls)" if len(group) > 1 else ""
        lines.append(
            f"  {number}. {first.kind:<9} {first.component + calls:<34} {', '.join(parts)}"
        )
    if trace.unscanned:
        lines.append(
            f"Not looked for, so neither counted nor masked: {', '.join(trace.unscanned)}. "
            f"{next(iter(trace.unscanned.values()))}"
        )
    if observation.path is not None:
        lines.append(f"Written to {observation.path}")
    return lines
