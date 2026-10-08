"""Where a run came from: the repository, branch and commit of the code that ran it.

A viewer shared by a team lists runs from many machines, and the time alone does not
say which change produced which. A run records what it can tell without asking anyone:
what the CI system says about the job, or else what git says about the folder the
command ran in. Nothing is asked of the network, and a remote's address is recorded
without the credentials it may carry.

`COMPLYDOC_REPOSITORY`, `COMPLYDOC_BRANCH`, `COMPLYDOC_COMMIT`, `COMPLYDOC_WORKFLOW` and
`COMPLYDOC_RUN_URL` say it outright, for a CI system this does not know, and
`COMPLYDOC_CONTEXT=off` records none of it.
"""

from __future__ import annotations

import os
import re
import subprocess
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

__all__ = ["RunContext", "repository_name", "run_context"]


@dataclass(frozen=True, slots=True)
class RunContext:
    repository: str | None = None
    """The repository, as `host/owner/name` or `owner/name`, never with credentials."""
    branch: str | None = None
    commit: str | None = None
    """The full commit id."""
    dirty: bool | None = None
    """Whether the working tree had uncommitted changes. None when not known, as in CI."""
    workflow: str | None = None
    """The CI workflow or pipeline that ran it."""
    url: str | None = None
    """The page of the CI run."""


def repository_name(remote: str) -> str | None:
    """`host/owner/name` from a git remote, without scheme, credentials or `.git`.

    `https://token@github.com/acme/docs.git` and `git@github.com:acme/docs.git` are both
    `github.com/acme/docs`: a token in a remote must not end up in a report.
    """
    remote = remote.strip()
    if not remote:
        return None
    scp = re.fullmatch(r"(?:[^@/\s]+@)?([^:/\s]+):(?!//)(.+)", remote)
    if scp:
        host, path = scp.groups()
    else:
        with_scheme = re.fullmatch(
            r"[a-z][a-z0-9+.-]*://(?:[^@/\s]*@)?([^/\s]+)/(.+)", remote, re.I
        )
        if not with_scheme:
            return None
        host, path = with_scheme.groups()
        host = re.sub(r":\d+$", "", host)
    path = path.strip("/").removesuffix(".git")
    return f"{host.lower()}/{path}" if path else None


def _git(folder: Path, *arguments: str) -> str | None:
    try:
        done = subprocess.run(
            ["git", "-C", str(folder), *arguments],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
            env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"},
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return done.stdout.strip() if done.returncode == 0 else None


def _from_git(folder: Path) -> RunContext | None:
    commit = _git(folder, "rev-parse", "HEAD")
    if not commit:
        return None
    branch = _git(folder, "rev-parse", "--abbrev-ref", "HEAD")
    status = _git(folder, "status", "--porcelain", "--untracked-files=no")
    remote = _git(folder, "config", "--get", "remote.origin.url")
    return RunContext(
        repository=repository_name(remote) if remote else None,
        # A detached HEAD has no branch to name.
        branch=branch if branch and branch != "HEAD" else None,
        commit=commit,
        dirty=None if status is None else bool(status),
    )


def _from_ci(env: Mapping[str, str]) -> RunContext | None:
    if env.get("GITHUB_ACTIONS") == "true":
        server = env.get("GITHUB_SERVER_URL", "https://github.com").rstrip("/")
        repository = env.get("GITHUB_REPOSITORY")
        run = env.get("GITHUB_RUN_ID")
        host = server.partition("://")[2]
        return RunContext(
            repository=f"{host}/{repository}" if repository else None,
            # On a pull request the ref is `123/merge`; the head ref is the branch.
            branch=env.get("GITHUB_HEAD_REF") or env.get("GITHUB_REF_NAME") or None,
            commit=env.get("GITHUB_SHA") or None,
            workflow=env.get("GITHUB_WORKFLOW") or None,
            url=f"{server}/{repository}/actions/runs/{run}" if repository and run else None,
        )
    if env.get("GITLAB_CI") == "true":
        gitlab = env.get("CI_SERVER_HOST")
        project = env.get("CI_PROJECT_PATH")
        return RunContext(
            repository=f"{gitlab}/{project}" if gitlab and project else project or None,
            branch=env.get("CI_COMMIT_REF_NAME") or None,
            commit=env.get("CI_COMMIT_SHA") or None,
            workflow=env.get("CI_PIPELINE_NAME") or env.get("CI_JOB_NAME") or None,
            url=env.get("CI_PIPELINE_URL") or None,
        )
    return None


def run_context(
    folder: Path | None = None, env: Mapping[str, str] | None = None
) -> RunContext | None:
    """What this run can say of where it came from, or None when it can say nothing.

    The CI system's word comes first, then git's about `folder` (the working folder when
    not given); what `COMPLYDOC_*` says outright replaces either.
    """
    env = os.environ if env is None else env
    if env.get("COMPLYDOC_CONTEXT", "").strip().lower() in {"off", "0", "false", "no"}:
        return None
    found = _from_ci(env) or _from_git(folder or Path.cwd()) or RunContext()
    said = {
        "repository": env.get("COMPLYDOC_REPOSITORY"),
        "branch": env.get("COMPLYDOC_BRANCH"),
        "commit": env.get("COMPLYDOC_COMMIT"),
        "workflow": env.get("COMPLYDOC_WORKFLOW"),
        "url": env.get("COMPLYDOC_RUN_URL"),
    }
    given = {key: value.strip() for key, value in said.items() if value and value.strip()}
    if "repository" in given:
        given["repository"] = repository_name(given["repository"]) or given["repository"]
    context = RunContext(
        repository=given.get("repository", found.repository),
        branch=given.get("branch", found.branch),
        commit=given.get("commit", found.commit),
        dirty=found.dirty,
        workflow=given.get("workflow", found.workflow),
        url=given.get("url", found.url),
    )
    return None if context == RunContext() else context
