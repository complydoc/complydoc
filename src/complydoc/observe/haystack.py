"""Haystack's components as steps: which are steps, and of what kind, and Haystack's own
tracer, through which a pipeline says what each component was given and returned.

Haystack's components share no base class: each is a class its `@component` decorator
remakes with one metaclass, and keeps in a registry. The components that read, split,
clean, embed and write documents are told apart by name, as Haystack and its
integrations name them: `PyPDFToDocument`, `DocumentSplitter`, `DocumentCleaner`,
`OpenAIDocumentEmbedder`, `DocumentWriter`. A text embedder embeds a query, not documents,
and is left alone, as are the components that answer questions.

A pipeline opens a span for each component it runs, and gives the span what the component
was given and returned. While a block is open, Haystack's tracer is wrapped by one that
makes a step of each component span, and hands every span on to the tracer it wraps,
Langfuse's or OpenTelemetry's or none, as it was. That tracer is sent a document's content
only where content tracing is on, as before: the step reads it whatever the setting. A
component the names above do not know is a step where it is given documents, as a
custom cleaning step is. A component run alone, outside a pipeline, opens no span, and is
observed by its `run`, as the rest of the library's classes are; inside a pipeline, its
`run` gives the step its settings, which the span does not carry.
"""

from __future__ import annotations

import contextlib
import sys
import time
from collections.abc import Iterator, Mapping
from contextvars import ContextVar
from typing import Any, Final

from complydoc.observe import session
from complydoc.observe.parameters import parameters_of

__all__ = ["claimed", "components", "install", "kind_of", "uninstall"]

_REGISTRY: Final = "haystack.core.component.component"
_TRACING: Final = "haystack.tracing.tracer"

_COMPONENT: Final = "haystack.component.run"
_INPUT: Final = "haystack.component.input"
_OUTPUT: Final = "haystack.component.output"

_proxy: Any = None
"""Haystack's global tracer, whose tracer this module wraps while a block is open."""
_wrapping: Any = None


def kind_of(cls: type) -> str | None:
    """The kind of step a component class is, or None where it is not one."""
    name = cls.__name__
    if name.endswith("ToDocument") or (
        name.endswith("Converter") and "converter" in cls.__module__
    ):
        return "load"
    if "Splitter" in name or name == "DocumentPreprocessor":
        return "split"
    if name.endswith("DocumentCleaner"):
        return "transform"
    if name.endswith("DocumentEmbedder"):
        return "embed"
    if name.endswith("DocumentWriter"):
        return "store"
    return None


def components(metaclass: type) -> list[type]:
    """The component classes defined so far."""
    registry = _registry()
    return [
        cls for cls in registry.values() if isinstance(cls, type) and isinstance(cls, metaclass)
    ]


def install() -> None:
    """Wrap Haystack's tracer, where Haystack is loaded; nothing is imported for it."""
    global _proxy, _wrapping
    proxy = getattr(sys.modules.get(_TRACING), "tracer", None)
    if proxy is None or _proxy is not None:
        return
    _proxy, _wrapping = proxy, _tracer(sys.modules[_TRACING])(proxy.actual_tracer)
    proxy.actual_tracer = _wrapping


def uninstall() -> None:
    """Put back the tracer `install` wrapped, unless the program has replaced it since."""
    global _proxy, _wrapping
    if _proxy is not None and _proxy.actual_tracer is _wrapping:
        _proxy.actual_tracer = _wrapping.inner
    _proxy = _wrapping = None


def claimed(component: Any) -> bool:
    """Whether `component` is the one a pipeline's span has made a step of. If it is, the
    step is given its settings, which the span does not carry, and `run` is no step."""
    run = _run.get()
    if run is None or run.recording is None or run.recording.owner is not None:
        return False
    cls = type(component)
    if f"{cls.__module__}.{cls.__qualname__}" != run.qualified:
        return False
    run.recording.owner = id(component)
    with contextlib.suppress(Exception):
        run.recording.parameters = parameters_of(component)
    return True


def _registry() -> dict[str, Any]:
    module = sys.modules.get(_REGISTRY)
    registry = getattr(getattr(module, "component", None), "registry", None)
    return registry if isinstance(registry, dict) else {}


class _Run:
    """A component a pipeline is running: a step once the span is told what it was given."""

    def __init__(self, tags: Mapping[str, Any]) -> None:
        self.started = time.perf_counter()
        self.label = str(tags.get("haystack.component.type", "component"))
        self.qualified = str(tags.get("haystack.component.fully_qualified_type", ""))
        cls = _registry().get(self.qualified)
        if isinstance(cls, type):
            self.module, self.kind = cls.__module__, kind_of(cls)
        else:
            self.module, self.kind = self.qualified.rpartition(".")[0], None
        # complydoc's own component runs a step, which is observed as itself.
        self.own = self.qualified.startswith("complydoc.")
        self.recording: session.Recording | None = None
        self._running: contextlib.AbstractContextManager[None] | None = None

    def content(self, key: str, value: Any) -> None:
        if key == _INPUT and self.recording is None and isinstance(value, Mapping):
            self._begin(value)
        elif key == _OUTPUT and self.recording is not None:
            session.finish(self.recording, value)

    def _begin(self, inputs: Mapping[str, Any]) -> None:
        documents = inputs.get("documents")
        kind = self.kind or ("transform" if isinstance(documents, list) and documents else None)
        if kind is None or self.own:
            return
        given = None if kind == "load" else documents
        recording = session.begin(
            kind, None, self.module, "run", given, label=self.label, started_at=self.started
        )
        if recording is None:
            return
        self.recording = recording
        self._running = session.running(recording)
        self._running.__enter__()

    def close(self, error: BaseException | None) -> None:
        if self._running is None:
            return
        running, self._running = self._running, None
        if error is None:
            running.__exit__(None, None, None)
            return
        # The step keeps the error; the pipeline raises it on.
        with contextlib.suppress(BaseException):
            running.__exit__(type(error), error, error.__traceback__)


_run: ContextVar[_Run | None] = ContextVar("complydoc_haystack_component", default=None)
"""The component a pipeline is running, while its span is open."""


def _tracer(tracing: Any) -> Any:
    """Haystack's `Tracer` and `Span` interfaces, over the tracer wrapped."""

    class ObservedSpan(tracing.Span):  # type: ignore[misc]
        def __init__(self, inner: Any, run: _Run | None) -> None:
            self.inner = inner
            self.run = run

        def set_tag(self, key: str, value: Any) -> None:
            self.inner.set_tag(key, value)

        def set_content_tag(self, key: str, value: Any) -> None:
            # The tracer wrapped decides for itself whether it is sent content.
            self.inner.set_content_tag(key, value)
            if self.run is not None:
                self.run.content(key, value)

        def raw_span(self) -> Any:
            return self.inner.raw_span()

        def get_correlation_data_for_logs(self) -> dict[str, Any]:
            return dict(self.inner.get_correlation_data_for_logs())

    class ObservedTracer(tracing.Tracer):  # type: ignore[misc]
        def __init__(self, inner: Any) -> None:
            self.inner = inner

        @contextlib.contextmanager
        def trace(
            self, operation_name: str, tags: dict[str, Any] | None = None, parent_span: Any = None
        ) -> Iterator[Any]:
            parent = parent_span.inner if isinstance(parent_span, ObservedSpan) else parent_span
            with self.inner.trace(operation_name, tags=tags, parent_span=parent) as inner:
                observed = operation_name == _COMPONENT and not session.idle()
                run = _Run(tags or {}) if observed else None
                token = _run.set(run)
                try:
                    yield ObservedSpan(inner, run)
                except BaseException as error:
                    if run is not None:
                        run.close(error)
                    raise
                else:
                    if run is not None:
                        run.close(None)
                finally:
                    _run.reset(token)

        def current_span(self) -> Any:
            return self.inner.current_span()

    return ObservedTracer
