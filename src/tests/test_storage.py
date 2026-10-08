"""Reports in a bucket: written by a run, served by the viewer, through the guard.

The bucket is moto's, a stand-in served on this machine, so these tests make real
connections through `offline.permitted()` and need no account and no network.
"""

from __future__ import annotations

import http.client
import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from typer.testing import CliRunner

pytest.importorskip("moto")
boto3 = pytest.importorskip("boto3")

from moto.server import ThreadedMotoServer  # noqa: E402

from complydoc import offline, storage  # noqa: E402
from complydoc.cli import app  # noqa: E402
from complydoc.storage import Mirror, RemoteFolder, StorageError, remote_folder  # noqa: E402
from complydoc.viewer import launch_ui  # noqa: E402

runner = CliRunner()
SAMPLE = Path(__file__).parents[1] / "complydoc" / "sample"
BUCKET = "team-reports"


@pytest.fixture
def bucket(monkeypatch: pytest.MonkeyPatch) -> Iterator[object]:
    """An empty bucket on this machine, and the settings that point boto3 at it."""
    was_armed = offline.is_armed()
    offline.disarm()
    server = ThreadedMotoServer(port=0, verbose=False)
    server.start()
    host, port = server.get_host_and_port()
    monkeypatch.setenv("AWS_ENDPOINT_URL", f"http://{host}:{port}")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    client = boto3.client("s3")
    client.create_bucket(Bucket=BUCKET)
    yield client
    server.stop()
    if was_armed:
        offline.arm()


def complydoc(*arguments: str):  # type: ignore[no-untyped-def]
    """Run a command, then stand the guard down again: the command armed it for the process,
    and these tests go on to look in the bucket themselves."""
    result = runner.invoke(app, list(arguments))
    offline.disarm()
    return result


def keys(client: object, prefix: str = "") -> list[str]:
    listed = client.list_objects_v2(Bucket=BUCKET, Prefix=prefix)  # type: ignore[attr-defined]
    return sorted(item["Key"] for item in listed.get("Contents", []))


@pytest.mark.parametrize(
    ("where", "expected"),
    [
        ("s3://team-reports/contracts", RemoteFolder("team-reports", "contracts")),
        ("s3://team-reports/contracts/2026/", RemoteFolder("team-reports", "contracts/2026")),
        ("s3://team-reports", RemoteFolder("team-reports", "")),
        # A command line hands a path over with its slashes collapsed.
        ("s3:/team-reports/contracts", RemoteFolder("team-reports", "contracts")),
        (Path("s3://team-reports/contracts"), RemoteFolder("team-reports", "contracts")),
        ("reports", None),
        ("/srv/reports", None),
        ("./s3/reports", None),
        (None, None),
    ],
)
def test_an_address_names_a_bucket_folder_and_a_path_does_not(where, expected):  # type: ignore[no-untyped-def]
    assert remote_folder(where) == expected


def test_an_address_with_no_bucket_is_refused():
    with pytest.raises(StorageError, match="names no bucket"):
        remote_folder("s3://")


def test_an_audit_is_written_to_the_bucket_with_what_it_keeps_beside_it(bucket, tmp_path: Path):  # type: ignore[no-untyped-def]
    result = complydoc(
        "audit",
        str(SAMPLE / "terms-and-conditions.pdf"),
        "--out",
        f"s3://{BUCKET}/contracts",
        "--name",
        "audit-1",
        "--no-ocr",
        "--page-images",
    )
    assert result.exit_code == 0, result.output
    assert f"s3://{BUCKET}/contracts/audit-1.json" in " ".join(result.output.split())

    written = keys(bucket)
    assert "contracts/audit-1.json" in written
    assert any(key.startswith("contracts/audit-1.parts/") for key in written), written
    body = bucket.get_object(Bucket=BUCKET, Key="contracts/audit-1.json")["Body"].read()
    assert json.loads(body)["run"]["target"].endswith("terms-and-conditions.pdf")
    # Nothing of the run is left on this machine.
    assert not list(tmp_path.iterdir())


def test_the_guard_is_back_as_it_was_after_an_upload(bucket, tmp_path: Path):  # type: ignore[no-untyped-def]
    (tmp_path / "run.json").write_text("{}")
    with offline.guarded():
        sent = storage.upload_folder(tmp_path, RemoteFolder(BUCKET, "x"))
        assert sent == [f"s3://{BUCKET}/x/run.json"]
        # The exception was for the upload only.
        with pytest.raises(offline.NetworkAccessError):
            http.client.HTTPConnection("example.com", 80, timeout=2).connect()


def test_a_bucket_that_cannot_be_written_says_so(bucket, tmp_path: Path):  # type: ignore[no-untyped-def]
    (tmp_path / "run.json").write_text("{}")
    with pytest.raises(StorageError, match="s3://no-such-bucket/x"):
        storage.upload_folder(tmp_path, RemoteFolder("no-such-bucket", "x"))

    result = complydoc(
        "audit",
        str(SAMPLE / "terms-and-conditions.pdf"),
        "--out",
        "s3://no-such-bucket/x",
        "--no-ocr",
        "-q",
    )
    assert result.exit_code == 2
    assert "Cannot write the report" in result.output


def get(port: int, path: str) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    connection.request("GET", path)
    response = connection.getresponse()
    body = response.read()
    connection.close()
    return response.status, body


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    folder = tmp_path / "dist"
    folder.mkdir()
    (folder / "index.html").write_text("<html><head></head><body></body></html>")
    return folder


def test_the_viewer_serves_a_bucket_folder_and_fetches_a_part_when_asked(bucket, dist: Path):  # type: ignore[no-untyped-def]
    audit = ["audit", str(SAMPLE / "terms-and-conditions.pdf"), "--no-ocr", "--page-images", "-q"]
    for name in ("audit-1", "audit-2"):
        done = complydoc(*audit, "--out", f"s3://{BUCKET}/contracts", "--name", name)
        assert done.exit_code == 0, done.output

    viewer = launch_ui(f"s3://{BUCKET}/contracts", port=0, open_browser=False, dist=dist)
    try:
        status, body = get(viewer.port, "/api/reports")
        assert status == 200
        listing = json.loads(body)
        assert listing["sources"] == [f"s3://{BUCKET}/contracts"]
        assert sorted(r["name"] for r in listing["reports"]) == ["audit-1.json", "audit-2.json"]

        report = next(r for r in listing["reports"] if r["name"] == "audit-1.json")
        status, body = get(viewer.port, f"/api/reports/{report['id']}")
        assert status == 200
        data = json.loads(body)
        assert data["run"]["schema_version"]

        # A page picture is still only in the bucket until the page asks for it.
        picture = next(key for key in keys(bucket) if "audit-1.parts/pages/" in key)
        relative = picture.removeprefix("contracts/")
        mirror = viewer._server.mirrors[0]
        assert not (mirror.folder / relative).exists()
        status, body = get(viewer.port, f"/api/reports/{report['id']}/files/{relative}")
        assert status == 200 and body[:2] == b"\xff\xd8"
        assert (mirror.folder / relative).is_file()
        # And nothing outside the report's own parts is handed over.
        assert get(viewer.port, f"/api/reports/{report['id']}/files/../audit-2.json")[0] == 404

        # A run written since appears, and one removed goes, when the bucket is looked at again.
        done = complydoc(*audit, "--out", f"s3://{BUCKET}/contracts", "--name", "audit-3")
        assert done.exit_code == 0, done.output
        bucket.delete_object(Bucket=BUCKET, Key="contracts/audit-2.json")
        mirror.refresh(force=True)
        assert sorted(r.name for r in viewer.reports()) == ["audit-1.json", "audit-3.json"]
        assert json.loads(get(viewer.port, "/api/health")[1])["storage_errors"] == []
    finally:
        folder = viewer._server.mirrors[0].folder
        viewer.stop()
    assert not folder.exists()


def test_a_bucket_that_cannot_be_read_is_said_and_the_viewer_still_starts(bucket, dist: Path):  # type: ignore[no-untyped-def]
    viewer = launch_ui("s3://no-such-bucket/x", port=0, open_browser=False, dist=dist)
    try:
        assert viewer.reports() == []
        assert viewer.storage_errors and "s3://no-such-bucket/x" in viewer.storage_errors[0]
    finally:
        viewer.stop()


def test_a_mirror_keeps_to_its_own_folder(bucket, tmp_path: Path):  # type: ignore[no-untyped-def]
    mirror = Mirror(RemoteFolder(BUCKET, "contracts"), tmp_path / "mirror")
    (tmp_path / "mirror").mkdir()
    with pytest.raises(StorageError):
        mirror._path("../elsewhere.json")
    assert not mirror.fetch(tmp_path / "mirror" / "audit.parts" / "pages" / "1.jpg")


def test_a_recorded_pipeline_writes_each_run_to_the_bucket_under_a_name_of_its_own(  # type: ignore[no-untyped-def]
    bucket, monkeypatch: pytest.MonkeyPatch
):
    import complydoc as cd
    from complydoc.observe import trace

    # Two runs in the same second, as two machines may have: neither replaces the other.
    monkeypatch.setattr(
        trace, "trace_stem", lambda name, started_at: "contracts-ingest-20261008-120000"
    )
    locations = []
    for _ in range(2):
        with cd.observe("contracts ingest", out=f"s3://{BUCKET}/pipelines") as observation:
            pass
        locations.append(observation.location)

    assert locations == [
        f"s3://{BUCKET}/pipelines/contracts-ingest-20261008-120000.json",
        f"s3://{BUCKET}/pipelines/contracts-ingest-20261008-120000-2.json",
    ]
    assert keys(bucket, "pipelines/") == [
        "pipelines/contracts-ingest-20261008-120000-2.json",
        "pipelines/contracts-ingest-20261008-120000.json",
    ]
    # There is no file of it left here to point at; the summary says where it went.
    assert observation.path is None
    assert f"Written to {locations[1]}" in observation.summary()


def test_a_pipeline_is_not_stopped_by_a_bucket_it_cannot_write_to(bucket):  # type: ignore[no-untyped-def]
    import complydoc as cd

    with (
        pytest.warns(UserWarning, match="could not record"),
        cd.observe("ingest", out="s3://no-such-bucket/x") as observation,
    ):
        result = 1 + 1
    assert result == 2
    assert observation.location is None
    assert observation.error and "no-such-bucket" in observation.error


@pytest.mark.parametrize("command", ["chunks", "routing", "demo"])
def test_a_command_that_writes_only_here_refuses_a_bucket(
    command: str, tmp_path: Path, monkeypatch
):  # type: ignore[no-untyped-def]
    """Not a folder on this machine named like the bucket, which is what a path would make."""
    monkeypatch.chdir(tmp_path)
    arguments = [command] if command == "demo" else [command, str(SAMPLE)]
    result = complydoc(*arguments, "--out", f"s3://{BUCKET}/x")
    assert result.exit_code == 2, result.output
    # The message comes in a box, wrapped to the terminal.
    said = " ".join(result.output.replace("│", " ").split())
    assert "writes to a folder on this machine" in said
    assert not list(tmp_path.iterdir())


def test_an_audit_to_a_bucket_leaves_no_folder_here(bucket, tmp_path: Path, monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.chdir(tmp_path)
    result = complydoc(
        "audit",
        str(SAMPLE / "terms-and-conditions.pdf"),
        "--out",
        f"s3://{BUCKET}/y",
        "--no-ocr",
        "-q",
    )
    assert result.exit_code == 0, result.output
    assert keys(bucket, "y/") == ["y/complydoc.json"]
    assert not list(tmp_path.iterdir())
