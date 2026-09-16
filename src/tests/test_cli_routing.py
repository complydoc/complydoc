"""The routing command: a manifest of how each page should be read."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from typer.testing import CliRunner

from complydoc.cli import app

runner = CliRunner()
SAMPLES = Path("src/complydoc/sample")


@pytest.fixture
def folder(tmp_path):
    documents = tmp_path / "documents"
    documents.mkdir()
    for name in ("employee-record.pdf", "terms-and-conditions.pdf"):
        shutil.copy(SAMPLES / name, documents / name)
    return documents


def test_the_manifest_carries_a_route_and_a_reason_for_every_page(folder, tmp_path):
    out = tmp_path / "out"
    result = runner.invoke(app, ["routing", str(folder), "--no-ocr", "--out", str(out)])
    assert result.exit_code == 0, result.output

    manifest = json.loads((out / "complydoc-routing.json").read_text())
    assert manifest["target"].endswith("documents")
    assert set(manifest["counts"]["pages"]) == {"text", "ocr", "vision"}
    assert [d["document"] for d in manifest["documents"]] == [
        "employee-record.pdf",
        "terms-and-conditions.pdf",
    ]
    for document in manifest["documents"]:
        assert document["pages"]
        for page in document["pages"]:
            assert page["route"] in ("text", "ocr", "vision")
            assert page["reason"]
            assert isinstance(page["characters"], int)

    # Priced against sending everything one way, with the model named.
    assert manifest["model"]
    assert manifest["cost_usd"]["routed"] is not None
    assert manifest["cost_usd"]["routed"] <= manifest["cost_usd"]["vision"]
    assert (out / "complydoc-routing.html").exists()


def test_the_summary_is_printed(folder, tmp_path):
    result = runner.invoke(
        app, ["routing", str(folder), "--no-ocr", "--out", str(tmp_path / "out")]
    )
    assert result.exit_code == 0, result.output
    assert "text" in result.output
    assert "by the route it needs" in result.output
    assert "Manifest" in result.output


def test_print_json_writes_the_manifest_to_stdout(folder, tmp_path):
    result = runner.invoke(
        app,
        ["routing", str(folder), "--no-ocr", "--out", str(tmp_path / "out"), "--print-json"],
    )
    assert result.exit_code == 0, result.output
    manifest = json.loads(result.stdout)
    assert manifest["documents"][0]["pages"][0]["route"] in ("text", "ocr", "vision")


def test_a_missing_path_and_an_unknown_model_exit_cleanly(folder, tmp_path):
    missing = runner.invoke(app, ["routing", str(tmp_path / "nope"), "--out", str(tmp_path)])
    assert missing.exit_code == 2

    unknown = runner.invoke(
        app, ["routing", str(folder), "--no-ocr", "--model", "not-a-model", "--out", str(tmp_path)]
    )
    assert unknown.exit_code == 2
    assert "Unknown model" in unknown.output
