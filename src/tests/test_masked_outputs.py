"""A default run writes no identifier it found in the clear, anywhere.

The findings table always masked its values, while the page text beside it, and
a picture of each page, carried the same values in full. These tests read every
file a default run writes and look for the values themselves.

Only checksum-confirmed values are looked for. A name is found by a model, and
each reading of a page is scanned on its own, so a name one reading yields and
another does not can survive in the second; that is the best-effort masking the
documentation describes, not a regression this could pin down.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from typer.testing import CliRunner

from complydoc.cli import app
from complydoc.ingest.base import IngestOptions
from complydoc.ingest.registry import load_document
from complydoc.sensitive.scanner import scan
from tests.helpers import FIXTURES

runner = CliRunner()

SOURCE = FIXTURES / "sensitive_sample.pdf"


@pytest.fixture(scope="module")
def confirmed_values(config) -> list[str]:
    document = load_document(SOURCE, IngestOptions(ocr=False))
    found = scan(document, config.sensitive, reveal=True)
    values = sorted({m.revealed for m in found.matches if m.evidence == "confirmed" and m.revealed})
    assert values, "the fixture holds checksum-confirmed identifiers"
    return values


@pytest.fixture
def folder(tmp_path: Path) -> Path:
    target = tmp_path / "in"
    target.mkdir()
    shutil.copy(SOURCE, target / SOURCE.name)
    return target


def _written(root: Path) -> str:
    return "\n".join(
        path.read_text(encoding="utf-8", errors="replace")
        for path in sorted(root.rglob("*"))
        if path.is_file()
    )


def _audit(folder: Path, out: Path, *extra: str) -> None:
    result = runner.invoke(
        app,
        [
            "audit",
            str(folder),
            "--out",
            str(out),
            "--no-ocr",
            "--jobs",
            "1",
            # A second reader, so the readings kept beside the text are covered too.
            "--compare-extractor",
            "pypdf",
            "--save-text",
            str(out / "text"),
            "--quiet",
            *extra,
        ],
    )
    assert result.exit_code == 0, result.output


def test_a_default_audit_writes_no_confirmed_value(tmp_path, folder, confirmed_values):
    out = tmp_path / "out"
    _audit(folder, out)
    written = _written(out)
    assert "text" in {p.name for p in out.iterdir()}, "the saved text is checked as well"
    leaked = [value for value in confirmed_values if value in written]
    assert not leaked, f"written in the clear: {len(leaked)} of {len(confirmed_values)}"


def test_a_default_audit_embeds_no_page_picture(tmp_path, folder):
    out = tmp_path / "out"
    _audit(folder, out)
    assert "data:image/jpeg" not in _written(out)


def test_reveal_still_shows_the_values(tmp_path, folder, confirmed_values):
    out = tmp_path / "out"
    _audit(folder, out, "--reveal")
    written = _written(out)
    assert any(value in written for value in confirmed_values)


def test_page_pictures_are_opt_in_and_disclosed(tmp_path, folder):
    out = tmp_path / "out"
    _audit(folder, out, "--page-images")
    written = _written(out)
    assert "data:image/jpeg" in written
    assert "embeds a picture of each page" in written


def test_reveal_keeps_a_masked_copy_of_each_page_for_the_viewer(tmp_path, folder, confirmed_values):
    out = tmp_path / "out"
    _audit(folder, out, "--reveal")
    (document,) = json.loads((out / "complydoc.json").read_text())["documents"]
    pages = document["extracted_text"]
    shown = "\n".join(p["text"] for p in pages)
    covered = "\n".join(
        [p["masked_text"] for p in pages]
        + [text for p in pages for text in p["masked_readings"].values()]
    )
    assert any(value in shown for value in confirmed_values)
    assert not [value for value in confirmed_values if value in covered]
    assert all(p["masked_readings"].keys() == p["readings"].keys() for p in pages)


def test_a_default_audit_keeps_no_second_copy(tmp_path, folder):
    out = tmp_path / "out"
    _audit(folder, out)
    (document,) = json.loads((out / "complydoc.json").read_text())["documents"]
    assert all(p.get("masked_text") is None for p in document["extracted_text"])
