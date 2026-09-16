"""Rules a folder has to meet, written in YAML and checked in CI.

    version: 1
    rules:
      no_identifiers:
        severity: high
      no_hidden:
        severity: medium
      readiness_at_least:
        score: 60
      no_network: true
      no_regressions:
        baseline: baseline.json
      all_categories_scanned:
        level: warning

Every rule is one of the checks in `complydoc.report.expectations`, so a policy
file and `cd.expect(...)` ask the same questions; the file exists so a team that
does not write Python can still gate a pipeline.

A rule with no parameters is written as `true`. `level: warning` reports a rule
without failing the gate; the default is `error`. Relative paths in a rule, such
as a baseline, are resolved from the policy file's own directory.
"""

from __future__ import annotations

import datetime as dt
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, model_validator

from complydoc.config.loader import ConfigError
from complydoc.report.expectations import Expectation
from complydoc.report.models import AuditReport

__all__ = [
    "RULES",
    "Policy",
    "PolicyResult",
    "RuleResult",
    "check_policy",
    "policy_markdown",
    "policy_sarif",
    "read_policy",
    "write_policy_markdown",
    "write_policy_sarif",
]

RULES: dict[str, set[str]] = {
    "no_identifiers": {"severity", "evidence", "categories"},
    "no_hidden": {"severity"},
    "readiness_at_least": {"score"},
    "global_score_at_least": {"score"},
    "facts_found": {"facts", "threshold"},
    "no_network": set(),
    "no_failures": set(),
    "all_categories_scanned": set(),
    "no_regressions": {"baseline", "score_tolerance"},
}
"""Every rule a policy can hold, with the parameters it takes."""

_PATH_PARAMETERS = {"baseline"}
"""Parameters holding a path, resolved from the policy file's directory."""

LEVELS = ("error", "warning")


class Policy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 1
    rules: dict[str, dict[str, Any] | bool]
    """Rule name to its parameters, or `true` for a rule that takes none."""

    @model_validator(mode="after")
    def _known_rules(self) -> Policy:
        if not self.rules:
            raise ValueError(f"a policy needs at least one rule; choose from {sorted(RULES)}")
        for name, settings in self.rules.items():
            if name not in RULES:
                raise ValueError(f"unknown rule {name!r}; choose from {sorted(RULES)}")
            if settings is False:
                continue
            given = set(settings) - {"level"} if isinstance(settings, dict) else set()
            unknown = given - RULES[name]
            if unknown:
                allowed = sorted(RULES[name]) or "no parameters"
                raise ValueError(f"{name} does not take {sorted(unknown)}; it takes {allowed}")
            level = settings.get("level", "error") if isinstance(settings, dict) else "error"
            if level not in LEVELS:
                raise ValueError(f"{name}: level is error or warning, not {level!r}")
        return self

    def parameters(self, name: str) -> dict[str, Any]:
        settings = self.rules[name]
        return (
            {k: v for k, v in settings.items() if k != "level"}
            if isinstance(settings, dict)
            else {}
        )

    def level(self, name: str) -> str:
        settings = self.rules[name]
        return str(settings.get("level", "error")) if isinstance(settings, dict) else "error"

    @property
    def active(self) -> list[str]:
        """Rules to run, in the order the file lists them. `false` switches one off."""
        return [name for name, settings in self.rules.items() if settings is not False]


def read_policy(path: str | os.PathLike[str]) -> Policy:
    """The validated policy at `path`. Raises `ConfigError` when it will not load."""
    source = Path(path).expanduser()
    try:
        data = yaml.safe_load(source.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigError(f"cannot read {source}: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"{source} should hold a mapping with `rules`")
    try:
        policy = Policy.model_validate(data)
    except ValueError as exc:
        raise ConfigError(f"{source} is invalid:\n{exc}") from exc
    return _resolve_paths(policy, source.parent)


def _resolve_paths(policy: Policy, folder: Path) -> Policy:
    rules: dict[str, dict[str, Any] | bool] = {}
    for name, settings in policy.rules.items():
        if isinstance(settings, dict):
            settings = dict(settings)
            for parameter in _PATH_PARAMETERS & set(settings):
                value = Path(str(settings[parameter])).expanduser()
                settings[parameter] = str(value if value.is_absolute() else folder / value)
        rules[name] = settings
    return policy.model_copy(update={"rules": rules})


@dataclass(frozen=True, slots=True)
class RuleResult:
    rule: str
    description: str
    """What the rule asked for, as the check itself words it."""
    level: str
    failures: list[str] = field(default_factory=list)
    error: str | None = None
    """Set when the rule could not run at all, such as facts without a comparison."""

    @property
    def passed(self) -> bool:
        return not self.failures and self.error is None


@dataclass(slots=True)
class PolicyResult:
    target: str
    rules: list[RuleResult] = field(default_factory=list)

    @property
    def failed(self) -> list[RuleResult]:
        """Rules that failed the gate. A warning rule never does."""
        return [r for r in self.rules if not r.passed and r.level == "error"]

    @property
    def warned(self) -> list[RuleResult]:
        return [r for r in self.rules if not r.passed and r.level == "warning"]

    @property
    def passed(self) -> bool:
        return not self.failed

    @property
    def failures_total(self) -> int:
        return sum(len(r.failures) for r in self.rules if not r.passed)


def check_policy(report: AuditReport, policy: Policy) -> PolicyResult:
    """Every rule against `report`, all of them, in the order the policy lists them."""
    result = PolicyResult(target=report.run.target)
    for name in policy.active:
        expectation = Expectation(report, collect=True)
        try:
            getattr(expectation, name)(**policy.parameters(name))
        except (ValueError, TypeError, OSError) as exc:
            # A rule that cannot run is not a rule that passed.
            result.rules.append(
                RuleResult(name, name, policy.level(name), [], f"{type(exc).__name__}: {exc}")
            )
            continue
        description, failures = expectation.collected[-1]
        result.rules.append(RuleResult(name, description, policy.level(name), list(failures)))
    return result


# ------------------------------------------------------------------ Markdown


def policy_markdown(result: PolicyResult) -> str:
    """A summary for a pull request comment or a chat message."""
    verdict = "passed" if result.passed else "failed"
    lines = [
        f"## complydoc policy {verdict}",
        "",
        f"`{result.target}`",
        "",
        "| Rule | Result | Failures |",
        "| --- | --- | --- |",
    ]
    for rule in result.rules:
        if rule.passed:
            outcome = "pass"
        elif rule.error is not None:
            outcome = "could not run"
        else:
            outcome = "fail" if rule.level == "error" else "warning"
        lines.append(f"| `{rule.rule}` | {outcome} | {len(rule.failures) or '—'} |")

    for rule in result.failed + result.warned:
        lines += ["", f"### `{rule.rule}` — {rule.description}", ""]
        if rule.error is not None:
            lines.append(f"The rule could not run: {rule.error}")
            continue
        lines += [f"- {item}" for item in rule.failures[:20]]
        if len(rule.failures) > 20:
            lines.append(f"- and {len(rule.failures) - 20} more")
    return "\n".join(lines) + "\n"


def write_policy_markdown(result: PolicyResult, path: str | os.PathLike[str]) -> Path:
    return _write(Path(path), policy_markdown(result))


# --------------------------------------------------------------------- SARIF


def policy_sarif(result: PolicyResult, report: AuditReport) -> dict[str, Any]:
    """The result as SARIF 2.1.0, for GitHub code scanning and similar tools."""
    from complydoc import __version__

    documents = {d.relative_path for d in report.documents}
    rules = [
        {
            "id": rule.rule,
            "name": rule.rule,
            "shortDescription": {"text": rule.description},
            "defaultConfiguration": {"level": rule.level},
        }
        for rule in result.rules
    ]

    findings: list[dict[str, Any]] = []
    for rule in result.rules:
        if rule.passed:
            continue
        if rule.error is not None:
            findings.append(_sarif_result(rule, f"{rule.rule} could not run: {rule.error}", None))
            continue
        for item in rule.failures:
            findings.append(_sarif_result(rule, item, _document_of(item, documents)))

    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "complydoc",
                        "version": __version__,
                        "informationUri": "https://complydoc.github.io/complydoc/",
                        "rules": rules,
                    }
                },
                "invocations": [
                    {
                        "executionSuccessful": result.passed,
                        "endTimeUtc": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
                    }
                ],
                "results": findings,
            }
        ],
    }


def _sarif_result(rule: RuleResult, message: str, document: str | None) -> dict[str, Any]:
    finding: dict[str, Any] = {
        "ruleId": rule.rule,
        "level": rule.level,
        "message": {"text": message},
    }
    if document is not None:
        finding["locations"] = [
            {"physicalLocation": {"artifactLocation": {"uri": document}}},
        ]
    return finding


def _document_of(failure: str, documents: set[str]) -> str | None:
    """The document a failure line names, when it names one complydoc read."""
    for name in documents:
        if failure.startswith(f"{name} ") or failure.startswith(f"{name}:"):
            return name
    return None


def write_policy_sarif(
    result: PolicyResult, report: AuditReport, path: str | os.PathLike[str]
) -> Path:
    content = json.dumps(policy_sarif(result, report), indent=2, sort_keys=True) + "\n"
    return _write(Path(path), content)


def _write(path: Path, content: str) -> Path:
    path = path.expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path
