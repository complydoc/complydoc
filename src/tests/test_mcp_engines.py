"""A detection engine another package installs, such as Veil, is what `complydoc mcp`
reads documents with; complydoc's own configuration reads when there is none."""

from __future__ import annotations

import io
import json
import shutil
from importlib.metadata import EntryPoint
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from complydoc.config.loader import DEFAULT_CONFIG_DIR
from complydoc.mcp import engines, serve

FIXTURES = Path(__file__).parent / "fixtures"


def quiet_config(tmp_path: Path) -> Path:
    """A configuration that finds nothing, so it is plain which one read a document."""
    directory = tmp_path / "engine-config"
    shutil.copytree(DEFAULT_CONFIG_DIR, directory, ignore=shutil.ignore_patterns("*.py"))
    sensitive = directory / "sensitive.yaml"
    sensitive.write_text(sensitive.read_text().replace("enabled: true", "enabled: false"))
    return directory


def installed(monkeypatch: pytest.MonkeyPatch, **providers: Any) -> None:
    points = [
        EntryPoint(name=name, value=f"fake:{name}", group=engines.GROUP) for name in providers
    ]
    monkeypatch.setattr(engines, "entry_points", lambda group: points)
    monkeypatch.setattr(EntryPoint, "load", lambda point: providers[point.name])


def talk(tmp_path: Path, *messages: dict[str, Any], **options: Any) -> list[dict[str, Any]]:
    docs = tmp_path / "docs"
    docs.mkdir(exist_ok=True)
    shutil.copy(FIXTURES / "invoice_de.pdf", docs / "invoice_de.pdf")
    out = io.StringIO()
    serve(
        [docs],
        stdin=io.StringIO("".join(json.dumps(m) + "\n" for m in messages)),
        stdout=out,
        store=tmp_path / "store.json",
        clean_copies=tmp_path / "clean",
        **options,
    )
    return [json.loads(line) for line in out.getvalue().splitlines()]


INITIALIZE = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
OPEN = {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {"name": "open_document", "arguments": {"path": "invoice_de.pdf"}},
}


def opened(reply: dict[str, Any]) -> str:
    return str(reply["result"]["content"][0]["text"])


def test_with_no_engine_installed_complydoc_reads_and_says_nothing_of_one(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    installed(monkeypatch)
    hello, reading = talk(tmp_path, INITIALIZE, OPEN)
    assert "found by" not in hello["result"]["instructions"]
    assert "•" in opened(reading)


def test_an_installed_engine_reads_and_the_assistant_is_told_its_name(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    config = quiet_config(tmp_path)
    installed(monkeypatch, veil=SimpleNamespace(name="Veil", config_dir=lambda: config))
    hello, reading = talk(tmp_path, INITIALIZE, OPEN)
    assert "found by Veil" in hello["result"]["instructions"]
    assert "•" not in opened(reading)


def test_engine_none_and_a_config_dir_each_win_over_an_installed_engine(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    config = quiet_config(tmp_path)
    installed(monkeypatch, veil=SimpleNamespace(name="Veil", config_dir=lambda: config))
    hello, reading = talk(tmp_path, INITIALIZE, OPEN, engine="none")
    assert "found by" not in hello["result"]["instructions"]
    assert "•" in opened(reading)
    (hello,) = talk(tmp_path, INITIALIZE, config_dir=DEFAULT_CONFIG_DIR)
    assert "found by" not in hello["result"]["instructions"]


def test_a_broken_engine_is_passed_over_and_never_stops_the_server(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    missing = tmp_path / "gone"
    installed(monkeypatch, veil=SimpleNamespace(name="Veil", config_dir=lambda: missing))
    hello, reading = talk(tmp_path, INITIALIZE, OPEN)
    assert "found by" not in hello["result"]["instructions"]
    assert "•" in opened(reading)
    assert "engine 'veil' not used" in capsys.readouterr().err


def test_an_engine_asked_for_by_name_must_be_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    installed(monkeypatch)
    with pytest.raises(LookupError):
        engines.find("veil")
