"""The GitHub Action in `action.yml`, checked without GitHub.

GitHub reads the file only when someone uses the action, so a broken one is found
by a user. These tests parse it, check that what it refers to exists, and run its
shell steps with the environment a runner would give them.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
ACTION = yaml.safe_load((ROOT / "action.yml").read_text(encoding="utf-8"))
STEPS = {step["name"]: step for step in ACTION["runs"]["steps"]}
SAMPLE = ROOT / "src" / "complydoc" / "sample"


BASH = ["bash", "--noprofile", "--norc", "-e", "-o", "pipefail", "-c"]
"""How GitHub runs a `shell: bash` step: with -e, so a failing command ends it."""


def _script(name: str) -> str:
    return str(STEPS[name]["run"])


def test_every_input_and_step_output_referred_to_exists():
    text = (ROOT / "action.yml").read_text(encoding="utf-8")
    inputs = set(ACTION["inputs"])
    assert set(re.findall(r"inputs\.([\w-]+)", text)) <= inputs
    ids = {step["id"] for step in ACTION["runs"]["steps"] if "id" in step}
    assert set(re.findall(r"steps\.([\w-]+)\.outputs", text)) <= ids


def test_the_guide_lists_every_input_and_output():
    guide = (ROOT / "docs" / "guides" / "github-action.md").read_text(encoding="utf-8")
    for name in [*ACTION["inputs"], *ACTION["outputs"]]:
        assert f"| `{name}` |" in guide, name


@pytest.mark.parametrize(
    ("ref", "version", "extras", "expected"),
    [
        ("v0.4.10", "", "ocr", "complydoc[ocr]==0.4.10"),
        ("main", "", "ocr, multilingual-names", "complydoc[ocr,multilingual-names]"),
        ("v0.4.10", "0.4.9", "", "complydoc==0.4.9"),
        ("0123abc", "", "", "complydoc"),
    ],
)
def test_the_install_step_picks_the_version(tmp_path, ref, version, extras, expected):
    script = re.sub(r"(?m)^uv tool install .*$", 'echo "$spec"', _script("Install complydoc"))
    script = re.sub(r"(?m)^complydoc doctor$", "", script)
    result = subprocess.run(
        [*BASH, script],
        env={"PATH": os.environ["PATH"], "VERSION": version, "EXTRAS": extras, "ACTION_REF": ref},
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout.strip().splitlines()[-1] == expected


def _check(tmp_path: Path, target: Path, policy: Path) -> dict[str, str]:
    outputs = tmp_path / "outputs"
    summary = tmp_path / "summary"
    env = {
        # The complydoc this test runs under, as the installed tool would be.
        "PATH": f"{Path(sys.executable).parent}{os.pathsep}{os.environ['PATH']}",
        "HOME": str(tmp_path),
        "RUNNER_TEMP": str(tmp_path),
        "GITHUB_OUTPUT": str(outputs),
        "GITHUB_STEP_SUMMARY": str(summary),
        "TARGET": str(target),
        "POLICY": str(policy),
        "ARGS": "--no-ocr --quiet --jobs 1",
    }
    result = subprocess.run(
        [*BASH, _script("Check documents")],
        env=env,
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert result.returncode == 0, "the check step reports; the last step decides"
    values = dict(line.split("=", 1) for line in outputs.read_text().splitlines())
    values["summary"] = summary.read_text()
    return values


def test_the_check_step_reports_a_failed_policy(tmp_path):
    policy = tmp_path / "policy.yaml"
    policy.write_text("version: 1\nrules:\n  no_hidden:\n    severity: medium\n")
    outputs = _check(tmp_path, SAMPLE.relative_to(ROOT), policy)

    assert outputs["exit-code"] == "1"
    assert outputs["passed"] == "false"
    assert "## complydoc policy failed" in outputs["summary"]
    # From the repository root, so a comment and code scanning both find the file.
    assert "`src/complydoc/sample`" in outputs["summary"]
    assert '"uri": "src/complydoc/sample/' in Path(outputs["sarif"]).read_text()


def test_the_check_step_reports_an_unreadable_policy(tmp_path):
    outputs = _check(tmp_path, SAMPLE, tmp_path / "missing.yaml")
    assert outputs["exit-code"] == "2"
    assert "could not check" in outputs["summary"]


@pytest.mark.parametrize(
    ("code", "fail", "status"),
    [("0", "true", 0), ("1", "true", 1), ("1", "false", 0), ("2", "false", 2)],
)
def test_the_last_step_decides_the_job(code, fail, status):
    result = subprocess.run(
        [*BASH, _script("Set the result")],
        env={"PATH": os.environ["PATH"], "CODE": code, "FAIL": fail},
        capture_output=True,
        text=True,
    )
    assert result.returncode == status


def test_the_comment_is_created_once_and_then_edited(tmp_path):
    log = tmp_path / "gh.log"
    fake = tmp_path / "bin" / "gh"
    fake.parent.mkdir()
    fake.write_text(
        "#!/bin/bash\n"
        'echo "$1 $2 $3" >> "$GHLOG"\n'
        'if [[ "$*" == *--paginate* && -n "$EXISTING" ]]; then echo "$EXISTING"; fi\n'
    )
    fake.chmod(0o755)
    summary = tmp_path / "summary.md"
    summary.write_text("## complydoc policy passed\n")

    for existing, verb in [("", "POST"), ("42", "PATCH")]:
        log.write_text("")
        subprocess.run(
            [*BASH, _script("Comment on the pull request")],
            env={
                "PATH": f"{fake.parent}{os.pathsep}{os.environ['PATH']}",
                "GHLOG": str(log),
                "EXISTING": existing,
                "SUMMARY": str(summary),
                "PR": "7",
                "REPO": "owner/repo",
                "CHECKED": "documents",
            },
            check=True,
        )
        calls = log.read_text().splitlines()
        assert calls[-1].startswith(f"api --method {verb}"), calls
