"""Detection engines another package installs, which `complydoc mcp` reads with.

complydoc finds personal details with the patterns and models in its own configuration.
A package can bring a better configuration, such as its own name models, by declaring an
entry point in the `complydoc.engines` group:

    [project.entry-points."complydoc.engines"]
    veil = "veil.complydoc:engine"

The entry point loads to an object with a `name`, said to the assistant, and a
`config_dir()` that returns a configuration directory, as `--config-dir` takes. When one is
installed, the MCP server reads documents with it; `--config-dir` still wins, and
`--engine none` reads with complydoc's own configuration whatever is installed.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from importlib.metadata import entry_points
from pathlib import Path
from typing import Protocol

GROUP = "complydoc.engines"


class Provider(Protocol):
    name: str

    def config_dir(self) -> Path | str: ...


@dataclass(frozen=True, slots=True)
class Engine:
    name: str
    """What the assistant is told reads the documents, such as "Veil"."""
    config_dir: Path


def installed() -> list[str]:
    """The names of the engines installed, by entry point, in order."""
    return sorted(point.name for point in entry_points(group=GROUP))


def find(choice: str | None = None) -> Engine | None:
    """The engine to read with: the one named `choice`, or the first installed when it is
    None. "none" chooses none. One that fails to load is said on stderr and passed over,
    so a broken engine never stops the server: complydoc's own configuration reads instead.
    """
    if choice == "none":
        return None
    points = sorted(entry_points(group=GROUP), key=lambda point: point.name)
    if choice is not None:
        points = [point for point in points if point.name == choice]
        if not points:
            raise LookupError(f"No engine called {choice!r} is installed.")
    for point in points:
        try:
            provider: Provider = point.load()
            directory = Path(provider.config_dir()).expanduser()
            if not directory.is_dir():
                raise FileNotFoundError(f"not a folder: {directory}")
            return Engine(name=str(provider.name), config_dir=directory)
        except Exception as failed:
            print(f"complydoc mcp: engine {point.name!r} not used: {failed}", file=sys.stderr)
            if choice is not None:
                raise
    return None
