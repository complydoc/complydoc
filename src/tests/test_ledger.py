"""Where a value went: found in reports by its fingerprint, never by the value itself."""

from __future__ import annotations

import http.client
import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from complydoc import offline
from complydoc.cli import app
from complydoc.fingerprint import identifier_fingerprint
from complydoc.ledger import find_value
from complydoc.viewer import launch_ui

runner = CliRunner()

IBAN = "GB29 NWBK 6016 1331 9268 19"
FINGERPRINT = identifier_fingerprint("iban", IBAN)
OTHER = identifier_fingerprint("email_address", "someone@example.com")


def identifier(fingerprint: str, label: str = "IBAN", occurrences: int = 1) -> dict[str, object]:
    return {
        "fingerprint": fingerprint,
        "label": label,
        "masked": "GB29 •••• 68 19",
        "severity": "high",
        "occurrences": occurrences,
    }


def write(path: Path, data: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))


@pytest.fixture
def reports(tmp_path: Path) -> Path:
    """An audit that found the account on two pages, a pipeline run that sent it to a
    host, a later run that masked it before the splitter, and a run that never held it."""
    folder = tmp_path / ".complydoc"
    match = {"fingerprint": FINGERPRINT, "label": "IBAN", "masked": "GB29 •••• 68 19"}
    write(
        folder / "complydoc.json",
        {
            "run": {
                "schema_version": 23,
                "target": "/work/contracts",
                "started_at": "2026-10-01T09:00:00",
            },
            "documents": [
                {
                    "relative_path": "msa.pdf",
                    "sensitive": {"matches": [{**match, "page": 3}, {**match, "page": 7}]},
                },
                {"relative_path": "clean.pdf", "sensitive": {"matches": []}},
            ],
        },
    )

    def pipeline(
        name: str, started: str, stages: list[dict[str, object]], commit: str | None = None
    ) -> None:
        write(
            folder / f"{name}.json",
            {
                "run": {
                    "schema_version": 23,
                    "target": "PyPDFLoader",
                    "started_at": started,
                    "context": {"commit": commit} if commit else None,
                },
                "documents": [],
                "trace": {"kind": "pipeline", "name": "contracts-ingest", "stages": stages},
            },
        )

    def stage(
        kind: str, component: str, held: list[dict[str, object]], hosts: list[str] | None = None
    ):  # type: ignore[no-untyped-def]
        return {"kind": kind, "component": component, "identifiers": held, "hosts": hosts or []}

    pipeline(
        "ingest-1",
        "2026-10-02T09:00:00",
        [
            stage("load", "PyPDFLoader", [identifier(FINGERPRINT), identifier(OTHER, "Email")]),
            stage(
                "split", "RecursiveCharacterTextSplitter", [identifier(FINGERPRINT, occurrences=2)]
            ),
            stage(
                "embed",
                "OpenAIEmbeddings",
                [identifier(FINGERPRINT, occurrences=2)],
                ["api.openai.com"],
            ),
        ],
        commit="a" * 40,
    )
    pipeline(
        "ingest-2",
        "2026-10-03T09:00:00",
        [
            stage("load", "PyPDFLoader", [identifier(FINGERPRINT)]),
            stage("transform", "Mask", []),
            stage("embed", "OpenAIEmbeddings", [], ["api.openai.com"]),
        ],
    )
    pipeline(
        "ingest-3",
        "2026-10-04T09:00:00",
        [stage("load", "PyPDFLoader", [identifier(OTHER, "Email")])],
    )
    return folder


@pytest.mark.parametrize(
    "typed", [IBAN, "gb29nwbk60161331926819", "GB29-NWBK-6016-1331-9268-19", FINGERPRINT]
)
def test_a_value_is_found_however_it_is_written(reports: Path, typed: str):
    trail = find_value(typed, reports)
    assert trail.found
    assert trail.label == "IBAN"
    assert trail.fingerprints == [FINGERPRINT]
    assert trail.reports_searched == 4
    assert [run.report for run in trail.runs] == [
        "ingest-2.json",
        "ingest-1.json",
        "complydoc.json",
    ]


def test_the_trail_says_which_pages_which_steps_and_which_hosts(reports: Path):
    masked, sent, audit = find_value(IBAN, reports).runs

    assert audit.kind == "audit" and audit.name == "contracts"
    (document,) = audit.documents
    assert (document.path, document.pages, document.occurrences) == ("msa.pdf", [3, 7], 2)
    assert audit.steps == [] and audit.reached is None and audit.sent_to == []

    assert sent.kind == "pipeline" and sent.name == "contracts-ingest"
    assert sent.commit == "a" * 40
    assert [(s.step, s.component, s.occurrences) for s in sent.steps] == [
        (1, "PyPDFLoader", 1),
        (2, "RecursiveCharacterTextSplitter", 2),
        (3, "OpenAIEmbeddings", 2),
    ]
    assert sent.reached == 3
    assert sent.sent_to == ["api.openai.com"]

    # Masked before the splitter: every step is listed, and the value is in the first only.
    # The embedding step still sent to its host, but not this value.
    assert [(s.component, s.held) for s in masked.steps] == [
        ("PyPDFLoader", True),
        ("Mask", False),
        ("OpenAIEmbeddings", False),
    ]
    assert masked.reached == 1
    assert masked.sent_to == []


def test_calls_one_after_another_of_one_component_are_one_step(tmp_path: Path):
    """As the trace shows them: a loader called once a file is one step of several calls."""
    load = {"kind": "load", "component": "PyPDFLoader", "method": "load", "hosts": []}
    write(
        tmp_path / "ingest.json",
        {
            "run": {"schema_version": 23, "target": "x", "started_at": "2026-10-02T09:00:00"},
            "documents": [],
            "trace": {
                "kind": "pipeline",
                "name": "ingest",
                "stages": [
                    {**load, "identifiers": [identifier(FINGERPRINT)]},
                    {**load, "identifiers": []},
                    {**load, "identifiers": [identifier(FINGERPRINT, occurrences=2)]},
                    # A call made inside another is part of its step, not one of its own.
                    {**load, "identifiers": [identifier(FINGERPRINT)], "parent": 2},
                    {"kind": "split", "component": "Splitter", "identifiers": [], "hosts": []},
                ],
            },
        },
    )
    (run,) = find_value(IBAN, tmp_path).runs
    assert [(s.step, s.component, s.calls, s.occurrences) for s in run.steps] == [
        (1, "PyPDFLoader", 3, 3),
        (2, "Splitter", 1, 0),
    ]
    assert run.reached == 1


def test_a_report_that_cannot_be_read_does_not_hide_the_others(reports: Path):
    """One report from a much older version, or not a report at all, is passed over."""
    (reports / "old.json").write_text(json.dumps({"run": "a report from long ago"}))
    (reports / "list.json").write_text("[1, 2, 3]")
    (reports / "broken.json").write_text("{not json")
    trail = find_value(IBAN, reports)
    assert trail.runs


def test_a_value_no_run_found_is_not_found_and_nothing_is_written(reports: Path):
    before = sorted(p.name for p in reports.rglob("*"))
    trail = find_value("DE89 3704 0044 0532 0130 00", reports)
    assert not trail.found
    assert trail.runs == [] and trail.label is None and trail.reports_searched == 4
    assert sorted(p.name for p in reports.rglob("*")) == before


def test_the_command_prints_the_trail_and_never_the_value(reports: Path):
    result = runner.invoke(app, ["find", IBAN, "--in", str(reports)])
    assert result.exit_code == 0, result.output
    output = " ".join(result.output.split())
    assert "contracts-ingest" in output and "msa.pdf" in output
    assert "api.openai.com" in output
    assert "Mask not there" in output
    assert "NWBK" not in output and "6016" not in output

    asked = runner.invoke(app, ["find", "--in", str(reports)], input=IBAN + "\n")
    assert asked.exit_code == 0, asked.output
    assert "NWBK" not in asked.output

    as_json = json.loads(runner.invoke(app, ["find", IBAN, "--in", str(reports), "--json"]).output)
    assert as_json["found"] is True and len(as_json["runs"]) == 3

    missing = runner.invoke(app, ["find", "nothing here", "--in", str(reports)])
    assert missing.exit_code == 1


def post(port: int, body: object, origin: str | None) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    headers = {"Content-Type": "application/json"}
    if origin:
        headers["Origin"] = origin
    connection.request("POST", "/api/find", body=json.dumps(body), headers=headers)
    response = connection.getresponse()
    data = response.read()
    connection.close()
    return response.status, data


def test_the_viewer_answers_it_for_its_own_page_even_read_only(reports: Path, tmp_path: Path):
    was_armed = offline.is_armed()
    offline.disarm()
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><head></head><body></body></html>")
    viewer = launch_ui(reports, port=0, open_browser=False, dist=dist, read_only=True)
    try:
        own = f"http://127.0.0.1:{viewer.port}"
        status, body = post(viewer.port, {"value": IBAN}, own)
        assert status == 200, body
        found = json.loads(body)
        assert found["found"] is True and found["label"] == "IBAN"
        assert len(found["runs"]) == 3
        assert "NWBK" not in body.decode()

        assert post(viewer.port, {"value": IBAN}, "http://evil.example")[0] == 403
        assert post(viewer.port, {"value": IBAN}, None)[0] == 403
        assert post(viewer.port, {"value": "  "}, own)[0] == 400
        assert post(viewer.port, {}, own)[0] == 400
    finally:
        viewer.stop()
        if was_armed:
            offline.arm()
