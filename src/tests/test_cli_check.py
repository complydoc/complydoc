"""The check command: a policy file as a gate, with output CI can read."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from typer.testing import CliRunner

from complydoc.cli import app

runner = CliRunner()
SAMPLES = Path("src/complydoc/sample")

STRICT = """
rules:
  no_hidden:
    severity: medium
  no_identifiers:
    severity: high
  no_network: true
"""

LENIENT = """
rules:
  no_network: true
  readiness_at_least:
    score: 1
  no_hidden:
    severity: medium
    level: warning
"""


@pytest.fixture
def folder(tmp_path):
    documents = tmp_path / "documents"
    documents.mkdir()
    for name in ("employee-record.pdf", "vendor-assessment.pdf"):
        shutil.copy(SAMPLES / name, documents / name)
    return documents


def policy(tmp_path, text, name="policy.yaml"):
    path = tmp_path / name
    path.write_text(text)
    return path


def test_a_failed_policy_exits_one_and_writes_markdown_and_sarif(folder, tmp_path):
    out = tmp_path / "out"
    result = runner.invoke(
        app,
        [
            "check", str(folder), "--policy", str(policy(tmp_path, STRICT)),
            "--markdown", str(out / "check.md"), "--sarif", str(out / "check.sarif"),
            "--out", str(out), "--no-ocr",
        ],
    )  # fmt: skip
    assert result.exit_code == 1, result.output
    assert "Policy failed" in result.output

    markdown = (out / "check.md").read_text()
    assert markdown.startswith("## complydoc policy failed")
    assert "`no_hidden`" in markdown and "`no_network`" in markdown

    sarif = json.loads((out / "check.sarif").read_text())
    assert sarif["version"] == "2.1.0"
    assert sarif["runs"][0]["tool"]["driver"]["name"] == "complydoc"
    assert sarif["runs"][0]["invocations"][0]["executionSuccessful"] is False
    rule_ids = {finding["ruleId"] for finding in sarif["runs"][0]["results"]}
    assert "no_hidden" in rule_ids
    located = [f for f in sarif["runs"][0]["results"] if "locations" in f]
    assert located[0]["locations"][0]["physicalLocation"]["artifactLocation"]["uri"].endswith(
        ".pdf"
    )


def test_a_policy_the_documents_meet_exits_zero(folder, tmp_path):
    result = runner.invoke(
        app,
        ["check", str(folder), "--policy", str(policy(tmp_path, LENIENT)),
         "--out", str(tmp_path / "out"), "--no-ocr"],
    )  # fmt: skip
    assert result.exit_code == 0, result.output
    # A warning rule reports without failing the gate.
    assert "warning" in result.output
    assert "Policy passed" in result.output


def test_a_written_report_can_be_checked_without_auditing_again(folder, tmp_path):
    out = tmp_path / "out"
    audit = runner.invoke(
        app, ["sensitive", str(folder), "--no-ocr", "--out", str(out), "--name", "current", "-q"]
    )
    assert audit.exit_code == 0, audit.output

    result = runner.invoke(
        app,
        ["check", "--report", str(out / "current.json"), "--policy", str(policy(tmp_path, STRICT))],
    )
    assert result.exit_code == 1, result.output
    assert "no_hidden" in result.output


@pytest.mark.parametrize(
    ("arguments", "message"),
    [
        (["check"], "No policy given"),
        (["check", "--policy", "policy.yaml"], "Pass a path to audit"),
    ],
)
def test_the_command_says_what_it_needs(tmp_path, arguments, message):
    result = runner.invoke(app, arguments)
    assert result.exit_code == 2
    assert message in result.output


def test_a_broken_policy_exits_two(folder, tmp_path):
    result = runner.invoke(
        app,
        ["check", str(folder), "--policy", str(policy(tmp_path, "rules:\n  nonsense: true\n"))],
    )
    assert result.exit_code == 2
    assert "unknown rule" in result.output
