"""Where a run came from: what CI says, what git says, and what never reaches a report."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from typer.testing import CliRunner

from complydoc.cli import app
from complydoc.report.context import RunContext, repository_name, run_context
from complydoc.report.json_reader import load_report

runner = CliRunner()


@pytest.mark.parametrize(
    ("remote", "name"),
    [
        ("https://github.com/acme/docs.git", "github.com/acme/docs"),
        ("https://github.com/acme/docs", "github.com/acme/docs"),
        ("git@github.com:acme/docs.git", "github.com/acme/docs"),
        ("ssh://git@gitlab.corp:2222/team/sub/docs.git", "gitlab.corp/team/sub/docs"),
        ("https://GitHub.com/acme/docs/", "github.com/acme/docs"),
        ("/srv/git/docs.git", None),
        ("", None),
    ],
)
def test_a_remote_is_named_by_its_host_and_path(remote: str, name: str | None):
    assert repository_name(remote) == name


@pytest.mark.parametrize(
    "remote",
    [
        "https://ghp_secrettoken@github.com/acme/docs.git",
        "https://duarte:hunter2@github.com/acme/docs.git",
        "https://oauth2:glpat-secret@gitlab.corp:8443/team/docs.git",
    ],
)
def test_credentials_in_a_remote_never_reach_the_name(remote: str):
    name = repository_name(remote)
    assert name is not None
    assert name.endswith("/docs")
    for secret in ("ghp_secrettoken", "hunter2", "glpat-secret", "duarte", "oauth2", "@"):
        assert secret not in name


def git(folder: Path, *arguments: str) -> None:
    subprocess.run(
        [
            "git",
            "-C",
            str(folder),
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            *arguments,
        ],
        check=True,
        capture_output=True,
    )


@pytest.fixture
def repository(tmp_path: Path) -> Path:
    folder = tmp_path / "pipeline"
    folder.mkdir()
    git(folder, "init", "-q", "-b", "main")
    (folder / "ingest.py").write_text("print('ingest')\n")
    git(folder, "add", "ingest.py")
    git(folder, "commit", "-q", "-m", "Ingest")
    git(folder, "remote", "add", "origin", "https://token@github.com/acme/docs.git")
    return folder


def test_git_says_the_repository_branch_and_commit(repository: Path):
    context = run_context(repository, env={})
    assert context is not None
    assert context.repository == "github.com/acme/docs"
    assert context.branch == "main"
    assert context.commit is not None and len(context.commit) == 40
    assert context.dirty is False
    assert context.workflow is None and context.url is None

    (repository / "ingest.py").write_text("print('changed')\n")
    changed = run_context(repository, env={})
    assert changed is not None and changed.dirty is True


def test_a_folder_that_is_no_repository_has_nothing_to_say(tmp_path: Path, monkeypatch):
    # Not even a repository further up, which a temporary folder may sit inside.
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    assert run_context(tmp_path, env={}) is None


def test_the_ci_system_is_believed_before_git(repository: Path):
    env = {
        "GITHUB_ACTIONS": "true",
        "GITHUB_SERVER_URL": "https://github.com",
        "GITHUB_REPOSITORY": "acme/docs",
        "GITHUB_SHA": "a" * 40,
        "GITHUB_REF_NAME": "12/merge",
        "GITHUB_HEAD_REF": "fix-tables",
        "GITHUB_WORKFLOW": "documents",
        "GITHUB_RUN_ID": "77",
    }
    assert run_context(repository, env=env) == RunContext(
        repository="github.com/acme/docs",
        branch="fix-tables",
        commit="a" * 40,
        workflow="documents",
        url="https://github.com/acme/docs/actions/runs/77",
    )

    gitlab = {
        "GITLAB_CI": "true",
        "CI_SERVER_HOST": "gitlab.corp",
        "CI_PROJECT_PATH": "team/docs",
        "CI_COMMIT_REF_NAME": "main",
        "CI_COMMIT_SHA": "b" * 40,
        "CI_PIPELINE_URL": "https://gitlab.corp/team/docs/-/pipelines/9",
    }
    context = run_context(repository, env=gitlab)
    assert context is not None
    assert (context.repository, context.branch, context.url) == (
        "gitlab.corp/team/docs",
        "main",
        "https://gitlab.corp/team/docs/-/pipelines/9",
    )


def test_what_is_said_outright_replaces_what_was_found_and_off_records_nothing(repository: Path):
    said = run_context(
        repository,
        env={"COMPLYDOC_BRANCH": "release", "COMPLYDOC_REPOSITORY": "https://t@git.corp/a/b.git"},
    )
    assert said is not None
    assert said.branch == "release"
    assert said.repository == "git.corp/a/b"
    assert said.commit is not None

    assert run_context(repository, env={"COMPLYDOC_CONTEXT": "off"}) is None


def test_an_audit_records_where_it_ran_and_it_reads_back(tmp_path: Path, monkeypatch):
    sample = Path(__file__).parents[1] / "complydoc" / "sample" / "terms-and-conditions.pdf"
    out = tmp_path / "out"
    monkeypatch.setenv("COMPLYDOC_REPOSITORY", "github.com/acme/docs")
    monkeypatch.setenv("COMPLYDOC_BRANCH", "main")
    monkeypatch.setenv("COMPLYDOC_COMMIT", "c" * 40)
    result = runner.invoke(app, ["audit", str(sample), "--out", str(out), "--no-ocr", "-q"])
    assert result.exit_code == 0, result.output

    written = json.loads((out / "complydoc.json").read_text())["run"]["context"]
    assert written["repository"] == "github.com/acme/docs"
    assert written["branch"] == "main"
    assert written["commit"] == "c" * 40

    context = load_report(out / "complydoc.json").run.context
    assert isinstance(context, RunContext)
    assert context.branch == "main"

    monkeypatch.setenv("COMPLYDOC_CONTEXT", "off")
    result = runner.invoke(app, ["audit", str(sample), "--out", str(out), "--no-ocr", "-q"])
    assert result.exit_code == 0, result.output
    assert json.loads((out / "complydoc.json").read_text())["run"]["context"] is None
