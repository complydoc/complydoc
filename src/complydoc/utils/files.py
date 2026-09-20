"""Writing an output file, and naming a document relative to what was audited.

Five writers had the same three lines of expand, make the parent, write, and two
of the five left the expand out, so `--out ~/reports` wrote a folder called `~`
for those two and not for the others.
"""

from __future__ import annotations

from pathlib import Path

__all__ = ["relative_to_root", "write_text"]


def write_text(path: Path, content: str) -> Path:
    """Write `content` to `path`, making the folder it sits in. Returns the path."""
    path = path.expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def relative_to_root(path: Path, root: Path) -> str:
    """`path` as the report names it: relative to the folder that was audited.

    `root` is what the caller passed, which is the folder itself when a folder
    was audited and the file when one file was. A path from outside `root` is
    left absolute, because a name it does not sit under would be a lie.
    """
    try:
        return str(path.relative_to(root if root.is_dir() else root.parent))
    except ValueError:
        return str(path)
