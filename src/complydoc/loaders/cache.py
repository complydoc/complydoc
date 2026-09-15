"""Loader output cached per file, so repeated comparisons skip parsing.

    report = cd.compare_loaders(loaders, paths="./contracts", cache_dir=".complydoc-cache")

An entry is keyed by the loader's name and the file's SHA-256, and holds the text
and metadata the loader returned, as JSON. A changed file is a cache miss. A loader
run with different options needs a different name, or the earlier output is reused.

The cache holds document text. Keep it where the documents themselves may be kept.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from complydoc.ingest.base import sha256_of

__all__ = ["LoaderCache"]


class LoaderCache:
    """A directory of cached loader output."""

    def __init__(self, directory: str | os.PathLike[str]) -> None:
        self.directory = Path(directory).expanduser()

    def _entry(self, loader: str, file: Path) -> Path:
        digest = hashlib.sha256(f"{loader}\0{sha256_of(file)}".encode()).hexdigest()
        return self.directory / digest[:2] / f"{digest}.json"

    def get(self, loader: str, file: Path) -> list[dict[str, Any]] | None:
        """The cached documents for `file`, or None when there is no usable entry."""
        try:
            entry = self._entry(loader, file)
            data = json.loads(entry.read_text(encoding="utf-8"))
            documents = data["documents"]
        except (OSError, ValueError, KeyError):
            return None
        return documents if isinstance(documents, list) else None

    def put(self, loader: str, file: Path, documents: list[tuple[str, dict[str, Any]]]) -> None:
        """Store `documents`, given as (text, metadata), for `file`."""
        entry = self._entry(loader, file)
        entry.parent.mkdir(parents=True, exist_ok=True)
        records = [{"page_content": text, "metadata": metadata} for text, metadata in documents]
        payload = {"loader": loader, "file": str(file), "documents": records}
        temporary = entry.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, default=str), encoding="utf-8")
        temporary.replace(entry)
