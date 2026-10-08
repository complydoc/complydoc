"""Reports in object storage: a bucket to write runs to, and to serve them from.

A team's reports have to be somewhere every pipeline can write and one viewer can read.
A shared folder does; so does a bucket, which most infrastructure already has. `out` and
the viewer's sources take an address, `s3://bucket/prefix`, in place of a folder.

This is the one place complydoc reaches a network on its own, so it is narrow about it:

- Only when an address names a bucket. Nothing is sent anywhere otherwise.
- Only that bucket. A run is written to a folder on this machine first, as always, and
  the files of that folder are then copied up; the viewer copies reports down.
- Through `offline.permitted()`, so the guard that stops everything else stays armed
  around it and records where the connection went.
- With your own credentials, found the way the AWS tools find them. `AWS_ENDPOINT_URL`
  names another S3-compatible store.

What goes up is the report, which holds masked values unless the run used `--reveal`.
The documents themselves are never uploaded.
"""

from __future__ import annotations

import contextlib
import os
import shutil
import tempfile
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from complydoc import offline

__all__ = [
    "Mirror",
    "RemoteFolder",
    "StorageError",
    "names_starting",
    "remote_folder",
    "staged",
    "upload_folder",
]

SCHEME = "s3"

REFRESH_SECONDS = 10.0
"""How long a mirror trusts its last look at the bucket."""


class StorageError(RuntimeError):
    """The bucket could not be reached, or the address does not name one."""


@dataclass(frozen=True, slots=True)
class RemoteFolder:
    """`s3://bucket/prefix`: a bucket, and the folder in it."""

    bucket: str
    prefix: str = ""

    def __str__(self) -> str:
        return f"{SCHEME}://{self.bucket}/{self.prefix}".rstrip("/")

    def key(self, relative: str) -> str:
        return f"{self.prefix}/{relative}" if self.prefix else relative

    def address(self, relative: str) -> str:
        return f"{SCHEME}://{self.bucket}/{self.key(relative)}"


def remote_folder(where: str | os.PathLike[str] | None) -> RemoteFolder | None:
    """The bucket folder `where` names, or None when it is a folder on this machine.

    A command line hands a path over with its slashes collapsed, so `s3:/bucket/x`
    is read as `s3://bucket/x` was meant.
    """
    if where is None:
        return None
    text = os.fspath(where)
    if not text.startswith(f"{SCHEME}:/"):
        return None
    rest = text[len(SCHEME) + 1 :].lstrip("/")
    bucket, _, prefix = rest.partition("/")
    if not bucket:
        raise StorageError(f"{text!r} names no bucket: write it as s3://bucket/folder")
    return RemoteFolder(bucket, prefix.strip("/"))


def _client() -> Any:
    try:
        import boto3
    except ImportError as exc:
        raise StorageError(
            'Writing to or reading from a bucket needs boto3: pip install "complydoc[s3]"'
        ) from exc
    return boto3.client("s3")


def _failed(action: str, remote: RemoteFolder, exc: Exception) -> StorageError:
    return StorageError(f"Could not {action} {remote}: {exc}")


def upload_folder(local: Path, remote: RemoteFolder) -> list[str]:
    """Copy every file under `local` to `remote`, keeping its place, and return their addresses."""
    files = sorted(path for path in local.rglob("*") if path.is_file())
    sent: list[str] = []
    with offline.permitted():
        client = _client()
        try:
            for file in files:
                relative = file.relative_to(local).as_posix()
                client.upload_file(str(file), remote.bucket, remote.key(relative))
                sent.append(remote.address(relative))
        except Exception as exc:
            raise _failed("write to", remote, exc) from exc
    return sent


def names_starting(remote: RemoteFolder, stem: str) -> set[str]:
    """The names of the objects in `remote` that start with `stem`, to choose one not taken."""
    with offline.permitted():
        client = _client()
        try:
            listed = client.list_objects_v2(Bucket=remote.bucket, Prefix=remote.key(stem))
        except Exception as exc:
            raise _failed("read", remote, exc) from exc
    return {item["Key"].rsplit("/", 1)[-1] for item in listed.get("Contents", [])}


@contextlib.contextmanager
def staged(out: str | os.PathLike[str]) -> Iterator[tuple[Path, RemoteFolder | None]]:
    """A folder on this machine to write a run to, and the bucket folder it is bound for.

    For a folder on this machine it is that folder, and there is nothing more to do. For
    a bucket it is a temporary folder: the caller writes there as it always does, and
    when the block ends without an error its files are copied up and it is removed.
    """
    remote = remote_folder(out)
    if remote is None:
        yield Path(out).expanduser(), None
        return
    local = Path(tempfile.mkdtemp(prefix="complydoc-"))
    try:
        yield local, remote
        upload_folder(local, remote)
    finally:
        shutil.rmtree(local, ignore_errors=True)


@dataclass
class Mirror:
    """A bucket folder's reports, copied to this machine for the viewer to serve.

    Reports are copied when they are new or changed, and removed when they are gone from
    the bucket. What a report keeps beside it, in its `.parts` folder, is copied only
    when asked for, since a viewer opens few of the pages a run has pictures of.
    """

    remote: RemoteFolder
    folder: Path
    _seen: dict[str, tuple[int, str]] = field(default_factory=dict)
    _parts: set[str] = field(default_factory=set)
    _looked: float = 0.0
    _lock: threading.Lock = field(default_factory=threading.Lock)
    error: str | None = None
    """Why the last look at the bucket failed, when it did. The reports already here stay."""

    @staticmethod
    def of(remote: RemoteFolder) -> Mirror:
        return Mirror(remote, Path(tempfile.mkdtemp(prefix="complydoc-mirror-")))

    def close(self) -> None:
        shutil.rmtree(self.folder, ignore_errors=True)

    def _relative(self, key: str) -> str:
        return key[len(self.remote.prefix) :].lstrip("/") if self.remote.prefix else key

    def refresh(self, *, force: bool = False) -> None:
        """Bring the reports here in line with the bucket, unless it was looked at just now."""
        with self._lock:
            if not force and time.monotonic() - self._looked < REFRESH_SECONDS:
                return
            try:
                self._refresh()
                self.error = None
            except StorageError as exc:
                self.error = str(exc)
            self._looked = time.monotonic()

    def _refresh(self) -> None:
        listed: dict[str, tuple[int, str, float]] = {}
        parts: set[str] = set()
        prefix = f"{self.remote.prefix}/" if self.remote.prefix else ""
        with offline.permitted():
            client = _client()
            try:
                pages = client.get_paginator("list_objects_v2").paginate(
                    Bucket=self.remote.bucket, Prefix=prefix
                )
                for page in pages:
                    for item in page.get("Contents", []):
                        relative = self._relative(item["Key"])
                        if not relative or relative.endswith("/"):
                            continue
                        folders = relative.split("/")[:-1]
                        if any(part.endswith(".parts") for part in folders):
                            parts.add(relative)
                        elif relative.endswith(".json"):
                            listed[relative] = (
                                int(item["Size"]),
                                str(item.get("ETag", "")),
                                item["LastModified"].timestamp(),
                            )
                for relative, (size, etag, modified) in listed.items():
                    if self._seen.get(relative) == (size, etag):
                        continue
                    target = self._path(relative)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    client.download_file(self.remote.bucket, self.remote.key(relative), str(target))
                    os.utime(target, (modified, modified))
                    self._seen[relative] = (size, etag)
                    # What it kept beside it may have changed with it.
                    stale = self._path(relative).with_suffix(".parts")
                    shutil.rmtree(stale, ignore_errors=True)
            except StorageError:
                raise
            except Exception as exc:
                raise _failed("read", self.remote, exc) from exc
        for gone in set(self._seen) - set(listed):
            self._path(gone).unlink(missing_ok=True)
            shutil.rmtree(self._path(gone).with_suffix(".parts"), ignore_errors=True)
            del self._seen[gone]
        self._parts = parts

    def _path(self, relative: str) -> Path:
        target = (self.folder / relative).resolve()
        if not target.is_relative_to(self.folder.resolve()):
            raise StorageError(f"{relative!r} is not a place in {self.remote}")
        return target

    def holds(self, file: Path) -> bool:
        return file.resolve().is_relative_to(self.folder.resolve())

    def fetch(self, file: Path) -> bool:
        """Copy down the part of a report that belongs at `file`, when the bucket has it."""
        relative = file.resolve().relative_to(self.folder.resolve()).as_posix()
        if relative not in self._parts:
            return False
        with self._lock:
            if file.is_file():
                return True
            target = self._path(relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            with offline.permitted():
                try:
                    _client().download_file(
                        self.remote.bucket, self.remote.key(relative), str(target)
                    )
                except Exception as exc:
                    self.error = str(_failed("read", self.remote, exc))
                    return False
        return True
