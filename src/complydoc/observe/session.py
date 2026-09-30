"""The `cd.observe` block, and the stages recorded while it is open.

A stage keeps references to what it was given and what it returned. Nothing is
scanned while the pipeline runs: the scanning happens when the block ends, so the
timings the trace shows are the pipeline's own.

Observing must never break the pipeline. A failure in complydoc's own bookkeeping
is recorded and warned about; what the pipeline raises is recorded and raised on.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import functools
import inspect
import os
import threading
import time
import traceback as tracebacks
import warnings
from collections.abc import Callable, Iterator, Sequence
from contextvars import ContextVar
from dataclasses import dataclass, field
from pathlib import Path
from types import TracebackType
from typing import TYPE_CHECKING, Any, Literal, ParamSpec, TypeVar

from complydoc import offline
from complydoc.observe.parameters import parameters_of

if TYPE_CHECKING:
    from complydoc.config.schema import Config
    from complydoc.report.models import AuditReport

__all__ = ["Observation", "Recording", "observe", "stage"]

Scan = Literal["patterns", "full", "off"]
SCANS: tuple[Scan, ...] = ("patterns", "full", "off")

P = ParamSpec("P")
R = TypeVar("R")

_current: Observation | None = None
_lock = threading.Lock()

_inside: ContextVar[Recording | None] = ContextVar("complydoc_inside_stage", default=None)
"""The stage running, so a call it makes is recorded inside it: a directory loader's
loader for each file, say. A call the same component makes on itself (`load` calling
`lazy_load`, `split_documents` calling `create_documents`) is part of the stage, not a
stage of its own."""


@dataclass(slots=True)
class Recording:
    """A stage as it was seen, before the block ends and it is scanned."""

    index: int
    kind: str
    component: str
    module: str
    method: str
    tags: list[str]
    parameters: dict[str, Any]
    parent: int | None = None
    """The stage this one ran inside, if it ran inside one."""
    started: float = 0.0
    """Seconds from the start of the block to when the stage was called."""
    owner: int | None = None
    """`id()` of the component, to tell a call it makes on itself from a call it makes out."""
    inputs: list[Any] | None = None
    outputs: list[Any] | None = None
    vectors: int | None = None
    dimensions: int | None = None
    seconds: float = 0.0
    connections: list[str] = field(default_factory=list)
    finished: bool = True
    error: str | None = None
    traceback: str | None = None


class Observation:
    """An open, then finished, `cd.observe` block.

    After the block: `report` is the report, `path` where it was written, and
    `summary()` a few lines on what each stage did. `error` says why there is no
    report when observing itself failed.
    """

    def __init__(
        self,
        name: str,
        *,
        out: str | os.PathLike[str] | None,
        scan: Scan,
        reveal: bool,
        config: Config | None,
        extracted_text: bool,
        models: Sequence[str] | None,
        previews: int = 20,
    ) -> None:
        if scan not in SCANS:
            raise ValueError(f"scan is one of {', '.join(SCANS)}, not {scan!r}")
        self.name = name
        self.out = None if out is None else Path(out).expanduser()
        self.scan: Scan = scan
        self.reveal = reveal
        self.config = config
        self.extracted_text = extracted_text
        self.models = models
        self.previews = max(0, previews)
        self.recordings: list[Recording] = []
        self.report: AuditReport | None = None
        self.path: Path | None = None
        self.error: str | None = None
        self.overhead = 0.0
        self._stack = contextlib.ExitStack()
        self._started = 0.0
        self._started_at = dt.datetime.now().astimezone()
        self._mark = 0
        self._libraries: dict[str, str] = {}

    def __enter__(self) -> Observation:
        from complydoc.observe import patches

        global _current
        with _lock:
            if _current is not None:
                raise RuntimeError(f"already observing {_current.name!r}: blocks do not nest")
            _current = self
        try:
            # Record mode: the pipeline may need the network, for an embedding API say, so
            # connections go through, and each is noted against the stage that made it.
            self._stack.enter_context(offline.permitted())
            self._mark = offline.connections_mark()
            self._libraries = patches.install()
        except BaseException:
            self._close()
            raise
        self._started_at = dt.datetime.now().astimezone()
        self._started = time.perf_counter()
        return self

    def __exit__(
        self,
        kind: type[BaseException] | None,
        error: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        from complydoc.observe.trace import build_report, write_trace

        seconds = time.perf_counter() - self._started
        made = offline.connections_since(self._mark)
        self._close()
        failed = None if error is None else f"{type(error).__name__}: {error}"
        try:
            self.report = build_report(self, seconds=seconds, connections=made, error=failed)
            if self.out is not None:
                self.path = write_trace(self.report, self.out, self.name, self._started_at)
        # Whatever went wrong in complydoc's own work, the pipeline's result stands.
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"
            warnings.warn(f"complydoc could not record {self.name!r}: {self.error}", stacklevel=2)

    def _close(self) -> None:
        from complydoc.observe import patches

        global _current
        patches.uninstall()
        self._stack.close()
        with _lock:
            _current = None

    @property
    def libraries(self) -> dict[str, str]:
        return dict(self._libraries)

    @property
    def started_at(self) -> dt.datetime:
        return self._started_at

    def summary(self) -> str:
        """What each stage did, a line each, and where the report was written."""
        from complydoc.observe.trace import summary_lines

        return "\n".join(summary_lines(self))


def observe(
    name: str = "pipeline",
    *,
    out: str | os.PathLike[str] | None = ".complydoc",
    scan: Scan = "patterns",
    reveal: bool = False,
    config: Config | None = None,
    extracted_text: bool = True,
    models: Sequence[str] | None = None,
    previews: int = 20,
) -> Observation:
    """Observe the ingestion pipeline run inside the `with` block.

    `name` names the pipeline: its runs are grouped under it, as an experiment's are.
    The report is written to `out`, `.complydoc` in the working directory by default,
    as `<name>-<time>.json`; `out=None` keeps it in memory only.

    `scan` sets what is looked for in each stage's output when the block ends:
    `patterns`, the default, reads identifiers by pattern at every stage and runs the
    name model on the documents loaded and on the last stage; `full` runs everything
    at every stage; `off` records counts, settings, timings and connections only.

    `extracted_text` keeps each loaded page's text, masked, so the viewer can show it
    with the chunks drawn over it. `previews` keeps that many of each step's items,
    masked, so the viewer can show what the step passed on; 0 keeps none. Library classes
    are observed if they were imported before the block opened.
    """
    return Observation(
        name,
        out=out,
        scan=scan,
        reveal=reveal,
        config=config,
        extracted_text=extracted_text,
        models=models,
        previews=previews,
    )


def idle() -> bool:
    """True where a call should go straight through: no block is open."""
    return _current is None


def in_stage() -> bool:
    """True while a stage is running: what it does is part of it."""
    return _inside.get() is not None


def begin(
    kind: str,
    component: Any,
    module: str,
    method: str,
    inputs: Any,
    *,
    label: str | None = None,
    started_at: float | None = None,
) -> Recording | None:
    """Open a stage in the current block, or return None where the call is not one: no
    block is open, or the component running is calling itself."""
    observation = _current
    if observation is None:
        return None
    within = _inside.get()
    if within is not None and component is not None and within.owner == id(component):
        return None
    started = time.perf_counter()
    try:
        parameters = parameters_of(component)
        tags = _tags(component)
    except Exception:
        parameters, tags = {}, []
    recording = Recording(
        index=0,
        kind=kind,
        component=label or type(component).__name__,
        module=module,
        method=method,
        tags=tags,
        parameters=parameters,
        parent=within.index if within is not None else None,
        started=round((started if started_at is None else started_at) - observation._started, 4),
        owner=id(component) if component is not None else None,
        inputs=list(inputs) if isinstance(inputs, list | tuple) else None,
    )
    with _lock:
        recording.index = len(observation.recordings)
        observation.recordings.append(recording)
    observation.overhead += time.perf_counter() - started
    return recording


def _tags(component: Any) -> list[str]:
    from complydoc.loaders.origin import loader_tags

    return loader_tags(component) if component is not None else []


@contextlib.contextmanager
def running(recording: Recording) -> Iterator[None]:
    """Mark the stage as running for the length of the block, and time it."""
    token = _inside.set(recording)
    mark = offline.connections_mark()
    started = time.perf_counter()
    try:
        yield
    except (StopIteration, StopAsyncIteration, GeneratorExit):
        raise
    except BaseException as error:
        recording.error = f"{type(error).__name__}: {error}"
        recording.traceback = "".join(tracebacks.format_exception(error))
        raise
    finally:
        recording.seconds += time.perf_counter() - started
        recording.connections.extend(offline.connections_since(mark))
        _inside.reset(token)


def finish(recording: Recording, result: Any) -> None:
    """Keep what the stage returned: documents, or for an embedding call, the vectors' shape,
    or for a vector store, how many it stored."""
    if recording.kind == "store":
        if isinstance(result, list | tuple):
            recording.vectors = len(result)
        return
    if recording.kind == "embed":
        if isinstance(result, list):
            recording.vectors = len(result)
            first = result[0] if result else None
            recording.dimensions = len(first) if isinstance(first, Sequence) else None
        return
    if isinstance(result, list | tuple):
        recording.outputs = list(result)


def stage(
    name: str | Callable[..., Any] | None = None, *, kind: str = "custom"
) -> Callable[..., Any]:
    """Mark a function of your own as a stage of the pipeline.

        @cd.stage("dedupe")
        def dedupe(documents): ...

    The first argument, when it is a list, is taken as what the stage was given, and a
    list returned as what it passed on. Library calls made inside it are part of it,
    not stages of their own. Outside a `cd.observe` block the function runs as it is.
    """

    def decorate(function: Callable[P, R]) -> Callable[P, R]:
        label = name if isinstance(name, str) else function.__name__

        if inspect.iscoroutinefunction(function):

            @functools.wraps(function)
            async def awrapper(*args: P.args, **kwargs: P.kwargs) -> Any:
                if idle():
                    return await function(*args, **kwargs)
                recording = begin(kind, None, function.__module__, function.__qualname__,
                                  args[0] if args else None, label=label)  # fmt: skip
                if recording is None:
                    return await function(*args, **kwargs)
                with running(recording):
                    result = await function(*args, **kwargs)
                finish(recording, result)
                return result

            return awrapper  # type: ignore[return-value]

        @functools.wraps(function)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            if idle():
                return function(*args, **kwargs)
            recording = begin(kind, None, function.__module__, function.__qualname__,
                              args[0] if args else None, label=label)  # fmt: skip
            if recording is None:
                return function(*args, **kwargs)
            with running(recording):
                result = function(*args, **kwargs)
            finish(recording, result)
            return result

        return wrapper

    if callable(name):
        return decorate(name)
    return decorate
