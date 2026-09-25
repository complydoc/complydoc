"""`complydoc ui`: finding reports, and serving them and the viewer on this machine only."""

from __future__ import annotations

import http.client
import json
import os
from pathlib import Path

import pytest
from typer.testing import CliRunner

from complydoc import offline
from complydoc.cli import app
from complydoc.viewer import ViewerNotBuiltError, find_reports, launch_ui

runner = CliRunner()


def write_report(path: Path, target: str = "/work/contracts", schema: int = 16) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"run": {"schema_version": schema, "target": target}, "documents": []})
    )
    return path


@pytest.fixture(autouse=True)
def guard_down():
    """These tests are the browser, connecting to the server on this machine.

    An audit run in-process earlier in the session leaves the network guard armed,
    as the command line does, and the guard refuses every connection, local ones
    included. The browser is another process and never meets it.
    """
    was_armed = offline.is_armed()
    offline.disarm()
    yield
    if was_armed:
        offline.arm()


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    """A stand-in for the built viewer: a page and one asset."""
    folder = tmp_path / "dist"
    (folder / "assets").mkdir(parents=True)
    (folder / "index.html").write_text(
        "<html><head><title>viewer</title></head><body></body></html>"
    )
    (folder / "assets" / "index-abc.js").write_text("console.log('viewer')")
    return folder


@pytest.fixture
def reports(tmp_path: Path) -> Path:
    folder = tmp_path / ".complydoc"
    write_report(folder / "complydoc.json")
    later = write_report(folder / "contracts" / "complydoc.json", target="/work/other")
    os.utime(later, (later.stat().st_atime, later.stat().st_mtime + 60))
    # Not audit reports: a routing manifest and a file that is not JSON.
    (folder / "complydoc-routing.json").write_text(json.dumps({"documents": [], "model": "x"}))
    (folder / "notes.json").write_text("not json")
    return folder


def get(port: int, path: str, host: str | None = None) -> tuple[int, dict[str, str], bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    headers = {"Host": host} if host else {}
    connection.request("GET", path, headers=headers)
    response = connection.getresponse()
    body = response.read()
    connection.close()
    return response.status, dict(response.getheaders()), body


def test_finds_audit_reports_newest_first_and_leaves_out_everything_else(reports: Path):
    found = find_reports(reports)
    assert [r.name for r in found] == ["contracts/complydoc.json", "complydoc.json"]
    assert [r.target for r in found] == ["/work/other", "/work/contracts"]
    assert all(r.schema_version == 16 for r in found)


def test_a_report_file_can_be_named_directly_and_is_listed_once(reports: Path):
    single = reports / "complydoc.json"
    found = find_reports(single, reports)
    assert sorted(r.name for r in found) == ["complydoc.json", "contracts/complydoc.json"]
    assert len({r.id for r in found}) == 2


def test_a_missing_folder_has_no_reports(tmp_path: Path):
    assert find_reports(tmp_path / "nowhere") == []


def test_serves_the_viewer_told_where_the_reports_are(reports: Path, dist: Path):
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        assert viewer.url.startswith("http://127.0.0.1:")
        status, headers, body = get(viewer.port, "/")
        assert status == 200
        assert headers["Content-Type"].startswith("text/html")
        page = body.decode()
        assert '<script type="application/json" id="complydoc-local">' in page
        assert '"reports": "api/reports"' in page

        status, headers, body = get(viewer.port, "/assets/index-abc.js")
        assert status == 200
        assert "max-age" in headers["Cache-Control"]
    finally:
        viewer.stop()


def test_lists_the_reports_and_hands_each_over_by_its_id(reports: Path, dist: Path):
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        status, headers, body = get(viewer.port, "/api/reports")
        assert status == 200
        assert headers["Cache-Control"] == "no-store"
        listed = json.loads(body)["reports"]
        assert [r["name"] for r in listed] == ["contracts/complydoc.json", "complydoc.json"]

        status, _, body = get(viewer.port, "/" + listed[1]["url"])
        assert status == 200
        assert json.loads(body)["run"]["target"] == "/work/contracts"

        assert get(viewer.port, "/api/reports/not-an-id")[0] == 404
    finally:
        viewer.stop()


def test_a_report_written_while_it_runs_is_listed_on_the_next_request(reports: Path, dist: Path):
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        write_report(reports / "later.json")
        names = [r["name"] for r in json.loads(get(viewer.port, "/api/reports")[2])["reports"]]
        assert "later.json" in names
    finally:
        viewer.stop()


@pytest.mark.parametrize(
    "path",
    [
        "/../../etc/passwd",
        "/assets/../../reports/complydoc.json",
        "/assets/..%2f..%2f.complydoc%2fcomplydoc.json",
        "/api/reports/../complydoc.json",
    ],
)
def test_serves_nothing_outside_the_viewer_and_the_reports_it_found(
    reports: Path, dist: Path, path: str
):
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        assert get(viewer.port, path)[0] == 404
    finally:
        viewer.stop()


def test_refuses_a_request_addressed_to_another_host(reports: Path, dist: Path):
    """What a DNS rebinding page's request looks like: this address, another name."""
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        assert get(viewer.port, "/api/reports", host=f"attacker.example:{viewer.port}")[0] == 403
        assert get(viewer.port, "/api/reports", host=f"localhost:{viewer.port}")[0] == 200
    finally:
        viewer.stop()


def test_takes_the_next_port_when_the_first_is_taken(reports: Path, dist: Path):
    first = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        second = launch_ui(reports, port=first.port, open_browser=False, dist=dist)
        try:
            assert second.port != first.port
        finally:
            second.stop()
    finally:
        first.stop()


def test_says_how_to_build_the_viewer_when_it_is_missing(tmp_path: Path):
    with pytest.raises(ViewerNotBuiltError, match="make viewer-bundle"):
        launch_ui(tmp_path, port=0, open_browser=False, dist=tmp_path / "no-dist")


def test_the_command_explains_a_missing_viewer_and_exits_2(tmp_path: Path, monkeypatch):
    monkeypatch.setattr("complydoc.viewer.server.DIST", tmp_path / "no-dist")
    result = runner.invoke(app, ["ui", str(tmp_path), "--no-browser"])
    assert result.exit_code == 2
    assert "make viewer-bundle" in result.output


def test_an_audit_says_how_to_open_the_viewer(tmp_path: Path):
    document = tmp_path / "docs" / "note.txt"
    document.parent.mkdir()
    document.write_text("Nothing sensitive here.")
    result = runner.invoke(app, ["sensitive", str(document.parent), "--out", str(tmp_path / "out")])
    assert result.exit_code == 0, result.output
    # The folder follows the command, since it is not the default; a narrow terminal cuts it short.
    assert "View    complydoc ui /" in result.output
