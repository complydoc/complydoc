"""The documentation, checked the way code is checked.

Two things rot in documentation: the examples stop working, and the reference
drifts from what the tool does. Both are checked here.

Every example in a guide is a real file under `docs/examples`, included into the
page and executed below, so a guide that stops working fails the build instead
of misleading somebody quietly. The reference pages are generated from the code
at build time, so the only thing worth asserting about them is that the build
still produces them.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
EXAMPLES = sorted((DOCS / "examples").glob("*.py"))


def test_there_are_examples_to_check():
    assert EXAMPLES, "the guides include these; an empty folder means they stopped being real"


@pytest.mark.parametrize("example", EXAMPLES, ids=lambda p: p.stem)
def test_every_example_in_the_guides_runs(example: Path, tmp_path: Path):
    """Run it exactly as a reader would, from the root of a checkout."""
    import importlib.util

    source = example.read_text(encoding="utf-8")
    if "langchain_community" in source and importlib.util.find_spec("langchain_community") is None:
        pytest.skip("needs the integrations dependency group")
    result = subprocess.run(
        [sys.executable, str(example)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=300,
        env={"HOME": str(tmp_path), "PATH": "/usr/bin:/bin", "PYTHONPATH": str(ROOT / "src")},
    )
    assert result.returncode == 0, f"{example.name} failed:\n{result.stderr[-2000:]}"
    assert result.stdout.strip(), f"{example.name} printed nothing, so it shows nothing"


@pytest.mark.parametrize("example", EXAMPLES, ids=lambda p: p.stem)
def test_every_example_is_shown_on_a_page(example: Path):
    """An example nobody includes is an example nobody maintains."""
    needle = f'--8<-- "examples/{example.name}"'
    pages = list((DOCS / "guides").rglob("*.md")) + list((DOCS / "explanation").rglob("*.md"))
    assert any(needle in page.read_text(encoding="utf-8") for page in pages), needle


@pytest.mark.skipif(shutil.which("mkdocs") is None, reason="the docs group is not installed")
def test_the_site_builds_with_every_reference_page(tmp_path: Path):
    """The reference is generated, so building it is the only way to check it."""
    out = tmp_path / "site"
    result = subprocess.run(
        ["mkdocs", "build", "--strict", "--site-dir", str(out)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=600,
    )
    assert result.returncode == 0, result.stderr[-3000:]
    for page in ("cli", "api", "report", "configuration"):
        assert (out / "reference" / page / "index.html").exists(), page

    # Generated from the Typer app, so every command has to appear.
    from complydoc.cli import app

    rendered = (out / "reference" / "cli" / "index.html").read_text(encoding="utf-8")
    for command in app.registered_commands:
        name = command.name or (command.callback.__name__ if command.callback else "")
        assert f"complydoc {name.replace('_', '-')}" in rendered, name
