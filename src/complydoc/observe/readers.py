"""Files read with a PDF library directly, as load steps.

Pipelines often read their documents with a few lines of their own rather than a
framework's loader: LangChain's own semantic search tutorial reads PDF pages with pypdf.
Each file opened with pypdf's `PdfReader` or PyMuPDF's `Document` in a block, and read
page by page, is a load step of its own: its time runs from opening the file, and it
passed on the text of each page taken from it, with the file and page named, as a loader's
documents would be.

A library called by a stage, as `PyPDFLoader` calls pypdf, is part of that stage and not
recorded again. A file opened and never read is no step.
"""

from __future__ import annotations

import functools
import sys
import time
from pathlib import Path
from typing import Any

from complydoc.observe import session

__all__ = ["install", "uninstall"]

_installed: list[tuple[type, str, Any]] = []


class _Opened:
    """A file opened in the block and not yet read: where, and since when."""

    __slots__ = ("path", "recording", "seconds", "started")

    def __init__(self, path: str | None, started: float, seconds: float) -> None:
        self.path = path
        self.started = started
        self.seconds = seconds
        self.recording: session.Recording | None = None


_opened: dict[int, tuple[Any, _Opened]] = {}
"""By `id()` of the reader, which is kept alive with it so the id cannot be reused."""


def install() -> dict[str, str]:
    """Wrap the PDF libraries the program has imported; return their names and versions."""
    libraries: dict[str, str] = {}
    pypdf = sys.modules.get("pypdf")
    if pypdf is not None:
        from pypdf import PdfReader
        from pypdf._page import PageObject

        _wrap(PdfReader, "__init__", _opening())
        _wrap(PageObject, "extract_text", _reading("PdfReader", lambda page: page.pdf))
        libraries["pypdf"] = getattr(pypdf, "__version__", "unknown")
    pymupdf = sys.modules.get("pymupdf") or sys.modules.get("fitz")
    if pymupdf is not None and hasattr(pymupdf, "Document") and hasattr(pymupdf, "Page"):
        _wrap(pymupdf.Document, "__init__", _opening())
        _wrap(pymupdf.Page, "get_text", _reading("Document", lambda page: page.parent))
        libraries["pymupdf"] = getattr(pymupdf, "VersionBind", "unknown")
    return libraries


def uninstall() -> None:
    while _installed:
        cls, name, original = _installed.pop()
        setattr(cls, name, original)
    _opened.clear()


def _wrap(cls: type, name: str, make: Any) -> None:
    original = cls.__dict__.get(name)
    if original is None or any(c is cls and n == name for c, n, _ in _installed):
        return
    setattr(cls, name, make(original))
    _installed.append((cls, name, original))


def _path_of(args: tuple[Any, ...], kwargs: dict[str, Any], reader: Any) -> str | None:
    given = args[0] if args else kwargs.get("stream", kwargs.get("filename"))
    if isinstance(given, str | Path):
        return str(given)
    name = getattr(given, "name", None) or getattr(reader, "name", None)
    return name if isinstance(name, str) and name else None


def _opening() -> Any:
    def make(original: Any) -> Any:
        @functools.wraps(original)
        def init(self: Any, *args: Any, **kwargs: Any) -> None:
            if session.idle() or session.in_stage():
                original(self, *args, **kwargs)
                return
            started = time.perf_counter()
            original(self, *args, **kwargs)
            opened = _Opened(_path_of(args, kwargs, self), started, time.perf_counter() - started)
            _opened[id(self)] = (self, opened)

        return init

    return make


def _reading(label: str, reader_of: Any) -> Any:
    def make(original: Any) -> Any:
        @functools.wraps(original)
        def read(self: Any, *args: Any, **kwargs: Any) -> Any:
            reader = reader_of(self)
            held = _opened.get(id(reader))
            if held is None or session.idle() or session.in_stage():
                return original(self, *args, **kwargs)
            opened = held[1]
            if opened.recording is None:
                opened.recording = _begin(label, reader, opened)
            recording = opened.recording
            if recording is None:
                return original(self, *args, **kwargs)
            with session.running(recording):
                text = original(self, *args, **kwargs)
            if isinstance(text, str):
                page = getattr(self, "page_number", None)
                page = getattr(self, "number", None) if page is None else page
                metadata: dict[str, Any] = {"source": opened.path} if opened.path else {}
                if isinstance(page, int):
                    metadata["page"] = page
                assert recording.outputs is not None
                recording.outputs.append({"page_content": text, "metadata": metadata})
            return text

        return read

    return make


def _begin(label: str, reader: Any, opened: _Opened) -> session.Recording | None:
    """The file's load step, begun where the file was opened and timed from there."""
    module = type(reader).__module__
    recording = session.begin(
        "load", None, module, "read", None, label=label, started_at=opened.started
    )
    if recording is None:
        return None
    recording.parameters = {"file_path": opened.path} if opened.path else {}
    recording.seconds += opened.seconds
    recording.outputs = []
    return recording
