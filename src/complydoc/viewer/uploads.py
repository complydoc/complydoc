"""Documents dropped on the viewer, copied to this machine and audited here.

Only `complydoc ui` serving this machine, and allowed to write, takes them: the
server refuses them under `--host` or `--read-only`. Each upload is a folder,
`<root>/<name>/`, its report is written beside it as `<root>/<name>.json`, and
one upload is read at a time, with the defaults `complydoc demo` uses.
"""

from __future__ import annotations

import datetime as dt
import re
import secrets
import threading
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

__all__ = ["MAX_FILE_BYTES", "Upload", "UploadError", "Uploads"]

MAX_FILE_BYTES = 1 << 30
"""The largest file one upload takes: 1 GiB."""

Progress = Callable[[int, int, Path], None]
Audit = Callable[[Path, Path, Progress], None]
"""Reads the folder and writes the report to the path, calling back as each document is read."""


class Readable(Protocol):
    def read(self, size: int, /) -> bytes: ...


class UploadError(ValueError):
    """A file the upload cannot take, or a step taken out of turn."""


@dataclass
class Upload:
    """One drop of documents, from the first file in to the report written."""

    id: str
    name: str
    folder: Path
    report: Path
    state: Literal["receiving", "waiting", "reading", "done", "failed"] = "receiving"
    files: int = 0
    done: int = 0
    total: int = 0
    current: str = ""
    error: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "folder": str(self.folder),
            "state": self.state,
            "files": self.files,
            "done": self.done,
            "total": self.total,
            "current": self.current,
            "error": self.error,
        }


def _audit_folder(folder: Path, report: Path, progress: Progress) -> None:
    from complydoc.api import full_audit, write_json

    # What `complydoc demo` reads with: the text kept for the diff, and pypdf beside it.
    audited = full_audit(
        folder,
        ocr=True,
        extracted_text=True,
        compare_extractors=("pypdf",),
        jobs=0,
        progress=progress,
    )
    write_json(audited, report)


def _name(given: str) -> str:
    """A folder name made from what the page called the upload, or one from the time."""
    name = re.sub(r"[^\w.-]+", "-", given).strip("-.")[:60]
    return name or f"upload-{dt.datetime.now():%Y-%m-%d-%H%M%S}"


def _relative(given: str) -> Path:
    """Where a file goes inside its upload: its path as dropped, with nothing that leaves it."""
    from complydoc.ingest.registry import supported_extensions

    parts = [part for part in re.split(r"[\\/]+", given) if part]
    if not parts or any(part in {".", ".."} or part.startswith(".") for part in parts):
        raise UploadError(f"{given!r} is not a file name complydoc takes")
    relative = Path(*parts)
    if relative.suffix.lower() not in supported_extensions():
        raise UploadError(
            f"{relative.name} is not a document complydoc reads: "
            f"{', '.join(supported_extensions())}"
        )
    return relative


class Uploads:
    """The uploads one viewer has taken, kept while it runs."""

    def __init__(self, root: Path, audit: Audit | None = None) -> None:
        self.root = root
        self._audit = audit or _audit_folder
        self._uploads: dict[str, Upload] = {}
        self._lock = threading.Lock()
        # One audit at a time: each already uses every core it is given.
        self._reading = threading.Lock()

    def create(self, name: str = "") -> Upload:
        with self._lock:
            base = _name(name)
            name, n = base, 1
            while (self.root / name).exists() or (self.root / f"{name}.json").exists():
                n += 1
                name = f"{base}-{n}"
            folder = self.root / name
            folder.mkdir(parents=True)
            upload = Upload(
                id=secrets.token_hex(8),
                name=name,
                folder=folder.resolve(),
                report=(self.root / f"{name}.json").resolve(),
            )
            self._uploads[upload.id] = upload
            return upload

    def get(self, upload_id: str) -> Upload | None:
        return self._uploads.get(upload_id)

    def receive(self, upload: Upload, given: str, stream: Readable, length: int) -> Path:
        """Copy one file of `length` bytes from `stream` into the upload."""
        if upload.state != "receiving":
            raise UploadError("this upload is already being read")
        if length > MAX_FILE_BYTES:
            raise UploadError(f"{given} is larger than {MAX_FILE_BYTES >> 30} GiB")
        file = upload.folder / _relative(given)
        file.parent.mkdir(parents=True, exist_ok=True)
        left = length
        with file.open("wb") as out:
            while left > 0:
                chunk = stream.read(min(left, 1 << 20))
                if not chunk:
                    break
                out.write(chunk)
                left -= len(chunk)
        if left:
            file.unlink(missing_ok=True)
            raise UploadError(f"{given} arrived incomplete")
        with self._lock:
            upload.files += 1
        return file

    def start(self, upload: Upload) -> None:
        """Read the upload in the background; `upload.state` says how far it is."""
        with self._lock:
            if upload.state != "receiving":
                raise UploadError("this upload is already being read")
            if not upload.files:
                raise UploadError("no document arrived")
            upload.state = "waiting"
        threading.Thread(
            target=self._run, args=(upload,), name="complydoc-upload", daemon=True
        ).start()

    def _run(self, upload: Upload) -> None:
        def progress(done: int, total: int, path: Path) -> None:
            upload.done, upload.total = done, total
            upload.current = path.relative_to(upload.folder).as_posix()

        with self._reading:
            upload.state = "reading"
            upload.total = upload.files
            try:
                self._audit(upload.folder, upload.report, progress)
            # Whatever stopped it is what the page shows.
            except Exception as exc:
                upload.error = str(exc) or type(exc).__name__
                upload.state = "failed"
                return
            upload.state = "done"
