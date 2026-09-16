"""Rules written in YAML, checked against a report."""

from __future__ import annotations

import json

import pytest

import complydoc as cd
from complydoc.config.loader import ConfigError
from complydoc.report.policy import (
    check_policy,
    policy_markdown,
    policy_sarif,
    read_policy,
)
from tests.helpers import FIXTURES

STRICT = """
version: 1
rules:
  no_hidden:
    severity: medium
  no_identifiers:
    severity: high
  readiness_at_least:
    score: 95
  no_failures:
    level: warning
  no_network: true
"""

LENIENT = """
rules:
  # 0, not 1: an encrypted PDF has no pages to read and scores 0.
  readiness_at_least:
    score: 0
  no_network: true
  no_failures:
    level: warning
"""


@pytest.fixture(scope="module")
def report(config):
    return cd.full_audit(FIXTURES, ocr=False, config=config)


def policy_file(tmp_path, text, name="policy.yaml"):
    path = tmp_path / name
    path.write_text(text)
    return read_policy(path)


def test_every_rule_runs_and_reports_its_own_failures(report, tmp_path):
    result = check_policy(report, policy_file(tmp_path, STRICT))

    assert [rule.rule for rule in result.rules] == [
        "no_hidden",
        "no_identifiers",
        "readiness_at_least",
        "no_failures",
        "no_network",
    ]
    assert not result.passed
    # The fixtures carry hidden instructions and high-severity identifiers.
    by_rule = {rule.rule: rule for rule in result.rules}
    assert by_rule["no_hidden"].failures
    assert by_rule["no_identifiers"].failures
    assert by_rule["no_network"].passed
    # A warning rule fails without failing the gate.
    assert not by_rule["no_failures"].passed
    assert by_rule["no_failures"] in result.warned
    assert by_rule["no_failures"] not in result.failed


def test_a_policy_that_the_documents_meet_passes(report, tmp_path):
    result = check_policy(report, policy_file(tmp_path, LENIENT))
    assert result.passed
    assert result.failed == []


def test_a_rule_can_be_switched_off(report, tmp_path):
    result = check_policy(
        report, policy_file(tmp_path, "rules:\n  no_network: true\n  no_hidden: false\n")
    )
    assert [rule.rule for rule in result.rules] == ["no_network"]


def test_a_rule_that_cannot_run_is_not_a_rule_that_passed(report, tmp_path):
    # `facts_found` with no facts and no loader comparison has nothing to check.
    result = check_policy(report, policy_file(tmp_path, "rules:\n  facts_found: true\n"))
    [rule] = result.rules
    assert not rule.passed
    assert rule.error and "facts" in rule.error
    assert not result.passed


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("rules: {}", "at least one rule"),
        ("rules:\n  no_such_rule: true\n", "unknown rule"),
        ("rules:\n  no_hidden:\n    nonsense: 1\n", "does not take"),
        ("rules:\n  no_hidden:\n    level: loud\n", "error or warning"),
        ("version: 1\n", "Field required"),
        ("- a list\n", "should hold a mapping"),
    ],
)
def test_an_invalid_policy_is_rejected(tmp_path, text, message):
    path = tmp_path / "bad.yaml"
    path.write_text(text)
    with pytest.raises(ConfigError, match=message):
        read_policy(path)


def test_a_baseline_path_is_resolved_from_the_policy_file(report, tmp_path):
    baseline = cd.write_json(report, tmp_path / "saved" / "baseline.json")
    policy = policy_file(tmp_path, "rules:\n  no_regressions:\n    baseline: saved/baseline.json\n")
    assert str(baseline) in json.dumps(policy.rules)
    result = check_policy(report, policy)
    assert result.passed, [rule.failures for rule in result.rules]


def test_the_markdown_summary_lists_every_rule(report, tmp_path):
    result = check_policy(report, policy_file(tmp_path, STRICT))
    text = policy_markdown(result)
    assert text.startswith("## complydoc policy failed")
    for rule in ("no_hidden", "no_identifiers", "no_network"):
        assert f"`{rule}`" in text
    assert "| Rule | Result | Failures |" in text


def test_the_sarif_names_the_rules_and_the_documents(report, tmp_path):
    result = check_policy(report, policy_file(tmp_path, STRICT))
    sarif = policy_sarif(result, report)

    assert sarif["version"] == "2.1.0"
    run = sarif["runs"][0]
    assert run["tool"]["driver"]["name"] == "complydoc"
    assert {rule["id"] for rule in run["tool"]["driver"]["rules"]} == {
        "no_hidden",
        "no_identifiers",
        "readiness_at_least",
        "no_failures",
        "no_network",
    }
    assert run["invocations"][0]["executionSuccessful"] is False

    hidden = [r for r in run["results"] if r["ruleId"] == "no_hidden"]
    assert hidden and hidden[0]["level"] == "error"
    located = [r for r in run["results"] if "locations" in r]
    assert located, "a failure naming a document should carry its location"
    uri = located[0]["locations"][0]["physicalLocation"]["artifactLocation"]["uri"]
    assert uri in {d.relative_path for d in report.documents}

    warnings = [r for r in run["results"] if r["level"] == "warning"]
    assert warnings and all(r["ruleId"] == "no_failures" for r in warnings)
