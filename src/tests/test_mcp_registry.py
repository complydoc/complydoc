"""`server.json`, the entry for complydoc in the official MCP Registry.

The registry is only read at release, by `publish.yml`, so a mismatch would be found
after the package is already on PyPI. The registry checks that the PyPI description
carries `mcp-name: <name>`, and the version it lists must be one PyPI has.
"""

from __future__ import annotations

import json
import tomllib
from pathlib import Path

import complydoc

ROOT = Path(__file__).resolve().parents[2]
SERVER = json.loads((ROOT / "server.json").read_text(encoding="utf-8"))
PYPI = next(p for p in SERVER["packages"] if p["registryType"] == "pypi")


def test_the_readme_proves_the_name_to_the_registry() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert f"<!-- mcp-name: {SERVER['name']} -->" in readme


def test_the_listed_package_is_this_one() -> None:
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    assert PYPI["identifier"] == project["name"]
    assert project["readme"] == "README.md"


def test_the_versions_are_the_packaged_version() -> None:
    assert SERVER["version"] == complydoc.__version__
    assert PYPI["version"] == complydoc.__version__


def test_the_command_is_the_mcp_command() -> None:
    assert PYPI["transport"] == {"type": "stdio"}
    assert PYPI["packageArguments"][0] == {"type": "positional", "value": "mcp"}
    flags = {a["name"] for a in PYPI["packageArguments"] if a["type"] == "named"}
    assert flags == {"--folder"}


def test_the_description_fits_the_registry() -> None:
    assert 1 <= len(SERVER["description"]) <= 100
