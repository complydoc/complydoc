"""`complydoc ui`: finding reports, and serving them and the viewer, here or to a team."""

from __future__ import annotations

import http.client
import json
import os
from pathlib import Path

import pytest
from typer.testing import CliRunner

from complydoc import offline
from complydoc.categories import CATEGORIES_FILENAME
from complydoc.cli import app
from complydoc.concepts import CONCEPTS_FILENAME, Concept
from complydoc.viewer import ViewerNotBuiltError, find_reports, launch_ui
from complydoc.viewer.server import is_loopback

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


def send(
    port: int, method: str, path: str, body: object, origin: str | None, content_type: str
) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    headers = {"Content-Type": content_type}
    if origin is not None:
        headers["Origin"] = origin
    connection.request(method, path, body=json.dumps(body), headers=headers)
    response = connection.getresponse()
    data = response.read()
    connection.close()
    return response.status, data


FINGERPRINT = "id-3f2a9c1e0b7d4e55"


def test_the_viewer_can_set_a_finding_aside_in_the_audited_folder(tmp_path: Path, dist: Path):
    audited = tmp_path / "contracts"
    audited.mkdir()
    reports = tmp_path / ".complydoc"
    write_report(reports / "complydoc.json", target=str(audited), schema=17)
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        (report,) = viewer.reports()
        url = f"/api/reports/{report.id}/ignores"
        origin = f"http://127.0.0.1:{viewer.port}"
        status, _headers, body = get(viewer.port, url)
        assert status == 200
        assert json.loads(body)["ignores"] == []

        entry = {"finding": FINGERPRINT, "reason": "Our own account.", "until": "2027-01-01"}
        status, body = send(viewer.port, "POST", url, entry, origin, "application/json")
        assert status == 200, body
        (written,) = json.loads(body)["ignores"]
        assert written["reason"] == "Our own account."
        assert written["by"]
        assert (audited / ".complydoc-ignore.yaml").is_file()

        status, body = send(
            viewer.port, "DELETE", url, {"finding": FINGERPRINT}, origin, "application/json"
        )
        assert status == 200
        assert json.loads(body)["ignores"] == []

        status, body = send(
            viewer.port, "POST", url, {"finding": "nope", "reason": "x"}, origin, "application/json"
        )
        assert status == 400
    finally:
        viewer.stop()


@pytest.mark.parametrize(
    ("origin", "content_type"),
    [
        ("http://evil.example", "application/json"),
        (None, "application/json"),
        ("http://127.0.0.1:{port}", "text/plain"),
    ],
)
def test_refuses_a_write_from_anywhere_but_its_own_page(
    tmp_path: Path, dist: Path, origin: str | None, content_type: str
):
    audited = tmp_path / "contracts"
    audited.mkdir()
    reports = tmp_path / ".complydoc"
    write_report(reports / "complydoc.json", target=str(audited), schema=17)
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        (report,) = viewer.reports()
        entry = {"finding": FINGERPRINT, "reason": "Planted."}
        status, _body = send(
            viewer.port,
            "POST",
            f"/api/reports/{report.id}/ignores",
            entry,
            origin.format(port=viewer.port) if origin else None,
            content_type,
        )
        assert status == 403
        assert not (audited / ".complydoc-ignore.yaml").exists()
    finally:
        viewer.stop()


def test_a_report_whose_folder_is_not_here_cannot_be_changed(reports: Path, dist: Path):
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        report = viewer.reports()[0]
        status, _headers, _body = get(viewer.port, f"/api/reports/{report.id}/ignores")
        assert status == 404
    finally:
        viewer.stop()


def test_the_viewer_can_edit_the_concepts_beside_the_documents(tmp_path: Path, dist: Path):
    concept = Concept(
        id="tariff_engine_id",
        label="Tariff engine ID",
        description="An identifier from our insurance tariff engine.",
        pattern=r"TE-\d{4}-\d{5}",
    ).model_dump()
    audited = tmp_path / "policies"
    audited.mkdir()
    reports = tmp_path / ".complydoc"
    write_report(reports / "complydoc.json", target=str(audited), schema=17)
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        (report,) = viewer.reports()
        url = f"/api/reports/{report.id}/concepts"
        origin = f"http://127.0.0.1:{viewer.port}"
        status, body = send(viewer.port, "POST", url, concept, origin, "application/json")
        assert status == 200, body
        assert json.loads(body)["concepts"][0]["id"] == "tariff_engine_id"
        assert (audited / CONCEPTS_FILENAME).is_file()

        broken = concept | {"pattern": "TE-("}
        status, body = send(viewer.port, "POST", url, broken, origin, "application/json")
        assert status == 400
        assert b"regular expression" in body

        status, body = send(
            viewer.port, "DELETE", url, {"id": "tariff_engine_id"}, origin, "application/json"
        )
        assert status == 200
        assert json.loads(body)["concepts"] == []

        status, _ = send(
            viewer.port, "POST", url, concept, "http://evil.example", "application/json"
        )
        assert status == 403
    finally:
        viewer.stop()


def test_the_viewer_can_switch_categories_off_and_back_beside_the_documents(
    tmp_path: Path, dist: Path
):
    audited = tmp_path / "policies"
    audited.mkdir()
    reports = tmp_path / ".complydoc"
    write_report(reports / "complydoc.json", target=str(audited), schema=21)
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        (report,) = viewer.reports()
        url = f"/api/reports/{report.id}/categories"
        origin = f"http://127.0.0.1:{viewer.port}"

        status, _headers, body = get(viewer.port, url)
        assert status == 200
        listed = json.loads(body)
        assert len(listed["categories"]) > 30
        email = next(c for c in listed["categories"] if c["id"] == "email_address")
        assert email["enabled"] and email["severity"] == email["shipped_severity"]

        change = {"id": "email_address", "enabled": False}
        status, body = send(viewer.port, "POST", url, change, origin, "application/json")
        assert status == 200, body
        email = next(c for c in json.loads(body)["categories"] if c["id"] == "email_address")
        assert email["enabled"] is False and email["shipped_enabled"] is True
        assert (audited / CATEGORIES_FILENAME).is_file()

        status, body = send(
            viewer.port, "POST", url, {"id": "nope", "enabled": False}, origin, "application/json"
        )
        assert status == 400 and b"not an identifier category" in body

        status, body = send(
            viewer.port, "DELETE", url, {"id": "email_address"}, origin, "application/json"
        )
        assert status == 200
        email = next(c for c in json.loads(body)["categories"] if c["id"] == "email_address")
        assert email["enabled"] is True

        status, _ = send(
            viewer.port, "POST", url, change, "http://evil.example", "application/json"
        )
        assert status == 403
    finally:
        viewer.stop()


def test_a_report_is_parsed_once_however_often_it_is_asked_about(
    reports: Path, monkeypatch: pytest.MonkeyPatch
):
    """A large report takes gigabytes to parse: listing it and finding its ignore and
    concepts files must not parse it again each time."""
    from complydoc.viewer import server

    report = write_report(reports / "fresh" / "complydoc.json", target=str(reports))
    parsed: list[str] = []
    loads = server.json.loads

    def counting(text: str, *args: object, **kwargs: object) -> object:
        parsed.append(text[:20])
        return loads(text, *args, **kwargs)

    monkeypatch.setattr(server.json, "loads", counting)
    before = len(parsed)
    for _ in range(3):
        find_reports(report)
        server.ignore_file_for(report)
        server.concepts_file_for(report)
    assert len(parsed) - before == 1


def test_a_report_the_browser_holds_is_not_sent_again(reports: Path, dist: Path):
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        _, _, listing = get(viewer.port, "/api/reports")
        url = json.loads(listing)["reports"][0]["url"]
        status, headers, body = get(viewer.port, f"/{url}")
        assert status == 200 and body and headers["Cache-Control"] == "no-cache"
        connection = http.client.HTTPConnection("127.0.0.1", viewer.port, timeout=5)
        connection.request("GET", f"/{url}", headers={"If-None-Match": headers["ETag"]})
        response = connection.getresponse()
        assert response.status == 304 and response.read() == b""
        connection.close()
    finally:
        viewer.stop()


def test_a_page_picture_beside_a_report_is_served_and_nothing_else(reports: Path, dist: Path):
    parts = reports / "complydoc.parts"
    (parts / "pages").mkdir(parents=True)
    (parts / "pages" / "0000-0001.jpg").write_bytes(b"\xff\xd8picture")
    # A JSON file kept beside a report is never listed as one.
    write_report(parts / "documents" / "0000.json")
    (reports / "secret.txt").write_text("not a part")
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        _, _, listing = get(viewer.port, "/api/reports")
        found = json.loads(listing)["reports"]
        assert sorted(r["name"] for r in found) == ["complydoc.json", "contracts/complydoc.json"]
        url = next(r["url"] for r in found if r["name"] == "complydoc.json")
        status, headers, body = get(
            viewer.port, f"/{url}/files/complydoc.parts/pages/0000-0001.jpg"
        )
        assert status == 200 and body == b"\xff\xd8picture"
        assert headers["Content-Type"] == "image/jpeg"
        for outside in ("secret.txt", "complydoc.parts/../secret.txt", "contracts/complydoc.json"):
            assert get(viewer.port, f"/{url}/files/{outside}")[0] == 404
    finally:
        viewer.stop()


# --- Served to a team: another address to listen on, read-only, and the names it answers to.


def audited_report(tmp_path: Path) -> tuple[Path, Path]:
    """A report beside a folder that is here, so its ignore file could be written."""
    audited = tmp_path / "contracts"
    audited.mkdir()
    reports = tmp_path / ".complydoc"
    write_report(reports / "complydoc.json", target=str(audited), schema=17)
    return reports, audited


@pytest.mark.parametrize(
    ("host", "loopback"),
    [
        ("127.0.0.1", True),
        ("localhost", True),
        ("::1", True),
        ("[::1]", True),
        ("0.0.0.0", False),
        ("192.168.1.20", False),
        ("reports.corp.example", False),
    ],
)
def test_only_this_machines_own_addresses_count_as_local(host: str, loopback: bool):
    assert is_loopback(host) is loopback


def test_a_viewer_on_this_machine_is_not_shared_and_can_edit(reports: Path, dist: Path):
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist)
    try:
        assert not viewer.shared
        assert not viewer.read_only
        assert '"readOnly": false' in get(viewer.port, "/")[2].decode()
    finally:
        viewer.stop()


def test_served_to_others_it_is_read_only_and_says_so_to_the_page(tmp_path: Path, dist: Path):
    reports, audited = audited_report(tmp_path)
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist, host="0.0.0.0")
    try:
        assert viewer.shared
        assert viewer.read_only
        assert not viewer.url.startswith("http://0.0.0.0")
        assert '"readOnly": true' in get(viewer.port, "/")[2].decode()

        (report,) = viewer.reports()
        url = f"/api/reports/{report.id}/ignores"
        # What the file holds can still be read.
        assert get(viewer.port, url)[0] == 200
        status, body = send(
            viewer.port,
            "POST",
            url,
            {"finding": FINGERPRINT, "reason": "Planted."},
            f"http://127.0.0.1:{viewer.port}",
            "application/json",
        )
        assert status == 403
        assert b"read-only" in body
        assert not (audited / ".complydoc-ignore.yaml").exists()
    finally:
        viewer.stop()


def test_read_only_can_be_asked_for_on_this_machine_too(tmp_path: Path, dist: Path):
    reports, audited = audited_report(tmp_path)
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist, read_only=True)
    try:
        assert not viewer.shared
        (report,) = viewer.reports()
        status, _body = send(
            viewer.port,
            "POST",
            f"/api/reports/{report.id}/ignores",
            {"finding": FINGERPRINT, "reason": "Planted."},
            f"http://127.0.0.1:{viewer.port}",
            "application/json",
        )
        assert status == 403
        assert not (audited / ".complydoc-ignore.yaml").exists()
    finally:
        viewer.stop()


def test_served_to_others_it_answers_to_its_own_names_and_the_ones_it_is_given(
    reports: Path, dist: Path
):
    viewer = launch_ui(
        reports,
        port=0,
        open_browser=False,
        dist=dist,
        host="0.0.0.0",
        allowed_hosts=["Reports.Corp.Example"],
    )
    try:
        # The port a reader names may be a proxy's or a container's, not the server's.
        assert get(viewer.port, "/api/reports", host="localhost:9999")[0] == 200
        assert get(viewer.port, "/api/reports", host="reports.corp.example")[0] == 200
        assert get(viewer.port, "/api/reports", host="[::1]:8500")[0] == 200
        # An address is answered whichever it is: the machine may have several.
        assert get(viewer.port, "/api/reports", host="192.168.1.20:8500")[0] == 200

        status, _headers, body = get(viewer.port, "/api/reports", host="attacker.example:8500")
        assert status == 403
        assert b"--allowed-host attacker.example" in body
    finally:
        viewer.stop()


def test_a_star_accepts_every_name_for_a_proxy_that_checks_it(reports: Path, dist: Path):
    viewer = launch_ui(
        reports, port=0, open_browser=False, dist=dist, host="0.0.0.0", allowed_hosts=["*"]
    )
    try:
        assert get(viewer.port, "/api/reports", host="anything.example")[0] == 200
    finally:
        viewer.stop()


def test_edits_allowed_for_a_team_still_come_only_from_the_viewers_own_page(
    tmp_path: Path, dist: Path
):
    reports, audited = audited_report(tmp_path)
    viewer = launch_ui(
        reports, port=0, open_browser=False, dist=dist, host="0.0.0.0", read_only=False
    )
    try:
        assert viewer.shared
        assert not viewer.read_only
        (report,) = viewer.reports()
        url = f"/api/reports/{report.id}/ignores"
        entry = {"finding": FINGERPRINT, "reason": "Our own account."}

        status, _body = send(
            viewer.port, "POST", url, entry, "http://evil.example", "application/json"
        )
        assert status == 403
        assert not (audited / ".complydoc-ignore.yaml").exists()

        # http.client names the server as 127.0.0.1:port, so this is its own page asking.
        own = f"http://127.0.0.1:{viewer.port}"
        status, body = send(viewer.port, "POST", url, entry, own, "application/json")
        assert status == 200, body
        assert (audited / ".complydoc-ignore.yaml").is_file()
    finally:
        viewer.stop()


def test_the_command_says_who_can_read_a_shared_viewer(reports: Path, dist: Path, monkeypatch):
    """`--host` is announced before it serves: who reaches it, and that it is read-only."""
    from complydoc.viewer import server

    # A checkout has no built viewer; the stand-in is enough to serve.
    monkeypatch.setattr(server, "DIST", dist)
    seen: dict[str, object] = {}

    class Stopped(server.ViewerServer):
        def wait(self) -> None:
            seen.update(shared=self.shared, read_only=self.read_only, host=self.host)

    monkeypatch.setattr(server, "ViewerServer", Stopped)
    result = runner.invoke(
        app, ["ui", str(reports), "--port", "0", "--no-browser", "--host", "0.0.0.0"]
    )
    assert result.exit_code == 0, result.output
    assert seen == {"shared": True, "read_only": True, "host": "0.0.0.0"}
    output = " ".join(result.output.split())
    assert "no sign-in" in output
    assert "read-only" in output
