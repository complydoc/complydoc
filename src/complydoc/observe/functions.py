"""Library functions a program calls by name, as steps: Unstructured's partitioners and
chunkers.

`partition_pdf` and `chunk_by_title` are plain functions, and a program imports them by
name, usually before the block opens: replacing them where Unstructured defines them would
not reach the name the program holds. So each is replaced where it is defined and in the
program's own modules that hold it, `__main__` among them, and put back in both when the
block ends. A library's module is left alone: what a library calls, it calls inside a step
of its own, of which the call is part.

A name bound inside a function before the block opens cannot be reached; there, mark the
function that calls it with `@cd.stage`.
"""

from __future__ import annotations

import functools
import importlib.metadata
import sys
import sysconfig
from pathlib import Path
from types import ModuleType
from typing import Any, Final

from complydoc.observe import session
from complydoc.observe.parameters import settings_of

__all__ = ["imported", "install", "uninstall"]

_OBSERVED: Final = "__complydoc_observed__"

_PARTITION: Final = "unstructured.partition."
"""Each module under it defines a partitioner, `partition` or `partition_<format>`."""

_CHUNKERS: Final = {
    "unstructured.chunking.title": "chunk_by_title",
    "unstructured.chunking.basic": "chunk_elements",
}

_NOT_SETTINGS: Final = frozenset({"text", "file", "elements", "filename", "url"})
"""Arguments that hold what a function reads, not how it is set."""

_replaced: list[tuple[ModuleType, str, Any]] = []
_wrapped: dict[int, tuple[Any, Any]] = {}
"""Each function replaced and its replacement, by `id()` of the function."""


def install() -> dict[str, str]:
    """Replace each function in the modules loaded; return the libraries and versions."""
    libraries: dict[str, str] = {}
    modules = [m for m in list(sys.modules.values()) if isinstance(m, ModuleType)]
    for module in modules:
        libraries.update(imported(module))
    if _wrapped:
        # A package that names a function its module defines, as `unstructured.partition.html`
        # names `partition_html`, and the program's modules that imported one by name.
        _rebind([m for m in modules if m.__name__.startswith("unstructured.")])
        _rebind(_programs_modules())
    return libraries


def imported(module: ModuleType) -> dict[str, str]:
    """Replace the functions `module` defines, as it is loaded or imported in the block."""
    name = getattr(module, "__name__", "")
    found: list[tuple[str, str, str | None]] = (
        [(n, "load", None) for n in _partitioners(module)] if name.startswith(_PARTITION) else []
    )
    if name in _CHUNKERS:
        found.append((_CHUNKERS[name], "split", "elements"))
    for function_name, kind, argument in found:
        original = getattr(module, function_name)
        if id(original) not in _wrapped:
            _wrapped[id(original)] = (original, _observed(original, kind, argument))
    if name.startswith("unstructured."):
        _rebind([module])
    return {"unstructured": _version("unstructured")} if found else {}


def uninstall() -> None:
    while _replaced:
        module, name, original = _replaced.pop()
        if getattr(getattr(module, name, None), _OBSERVED, False):
            setattr(module, name, original)
    _wrapped.clear()


def _partitioners(module: ModuleType) -> list[str]:
    return [
        name
        for name, value in vars(module).items()
        if (name == "partition" or name.startswith("partition_"))
        and callable(value)
        and getattr(value, "__module__", None) == module.__name__
        and not getattr(value, _OBSERVED, False)
    ]


def _rebind(modules: list[ModuleType]) -> None:
    """Replace each function replaced wherever one of `modules` holds it."""
    for module in modules:
        for name, value in list(vars(module).items()):
            held = _wrapped.get(id(value))
            if held is not None and held[0] is value:
                setattr(module, name, held[1])
                _replaced.append((module, name, value))


def _programs_modules() -> list[ModuleType]:
    """`__main__`, and the loaded modules that are neither installed nor the standard
    library's, nor complydoc's."""
    paths = sysconfig.get_paths()
    libraries = {
        Path(paths[key]).resolve() for key in ("stdlib", "platstdlib", "purelib", "platlib")
    }
    own = Path(__file__).resolve().parents[1]
    found = []
    for name, module in list(sys.modules.items()):
        if not isinstance(module, ModuleType):
            continue
        if name == "__main__":
            found.append(module)
            continue
        file = getattr(module, "__file__", None)
        if not isinstance(file, str):
            continue
        path = Path(file).resolve()
        if "site-packages" in path.parts or "dist-packages" in path.parts:
            continue
        if any(path.is_relative_to(p) for p in (*libraries, own)):
            continue
        found.append(module)
    return found


def _observed(function: Any, kind: str, argument: str | None) -> Any:
    """`function`, recording a step each time it is called in a block and not in a step."""

    @functools.wraps(function)
    def observed(*args: Any, **kwargs: Any) -> Any:
        if session.idle() or session.in_stage():
            return function(*args, **kwargs)
        given = (args[0] if args else kwargs.get(argument)) if argument else None
        name = function.__name__
        recording = session.begin(kind, None, function.__module__, name, given, label=name)
        if recording is None:
            return function(*args, **kwargs)
        recording.parameters = _settings(args, kwargs, kind)
        with session.running(recording):
            result = function(*args, **kwargs)
        session.finish(recording, result)
        return result

    setattr(observed, _OBSERVED, True)
    return observed


def _settings(args: tuple[Any, ...], kwargs: dict[str, Any], kind: str) -> dict[str, Any]:
    """A function's settings are its keyword arguments, and the file a partitioner reads."""
    settings = settings_of({k: v for k, v in kwargs.items() if k not in _NOT_SETTINGS})
    filename = args[0] if args and kind == "load" else kwargs.get("filename")
    if filename is not None:
        settings.update(settings_of({"filename": filename}))
    return dict(sorted(settings.items()))


def _version(distribution: str) -> str:
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return "unknown"
