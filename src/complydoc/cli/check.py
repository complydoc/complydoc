"""`check`: hold a folder to the rules in a policy file, for CI."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Annotated

import typer
from rich.markup import escape
from rich.table import Table

from complydoc import offline
from complydoc.audit.run import COMPONENTS, run_audit
from complydoc.cli.classifiers import ClassifierError, classifying
from complydoc.cli.common import (
    DEFAULT_OUT,
    ClassifierOpt,
    ClassifierThresholdOpt,
    ConfigOpt,
    ExtractorOpt,
    JobsOpt,
    NameOpt,
    OcrOpt,
    OutDirOpt,
    PasswordOpt,
    QuietOpt,
    RecurseOpt,
    SampleOpt,
    TimeoutOpt,
    app,
    console,
    emit,
    errors,
    link,
    load_config_or_exit,
)
from complydoc.config.loader import ConfigError
from complydoc.cost.estimator import UnknownModelError

if TYPE_CHECKING:  # pragma: no cover - type-checking imports only
    from complydoc.report.policy import PolicyResult, RuleResult


_SHOWN = 10
"""Failures listed per rule. A rule that fails on every document otherwise
scrolls the rules that matter off the screen."""

_LINE = 150
"""Characters of a failure line kept, so one long path does not wrap three times."""


def _outcome(rule: RuleResult) -> str:
    """How one rule came out, as the table shows it."""
    if rule.passed:
        return "[green]pass[/]"
    if rule.error is not None:
        return "[yellow]could not run[/]"
    if rule.level == "warning":
        return "[yellow]warning[/]"
    return "[red]fail[/]"


def _rules_table(result: PolicyResult) -> Table:
    """Every rule in the policy and how it came out."""
    table = Table(box=None, pad_edge=False)
    table.add_column("Rule")
    table.add_column("Result")
    table.add_column("Failures", justify="right")
    for rule in result.rules:
        table.add_row(rule.rule, _outcome(rule), str(len(rule.failures) or "—"))
    return table


def _print_failures(result: PolicyResult) -> None:
    """What failed each rule, under the rule it failed."""
    for rule in result.failed + result.warned:
        console.print(f"\n[bold]{rule.rule}[/] — expected {rule.description}")
        if rule.error is not None:
            console.print(f"  [yellow]could not run: {rule.error}[/]", markup=False)
            continue
        for item in rule.failures[:_SHOWN]:
            line = " ".join(item.split())
            console.print(f"  {line[:_LINE]}{'…' if len(line) > _LINE else ''}", markup=False)
        if len(rule.failures) > _SHOWN:
            console.print(f"  and {len(rule.failures) - _SHOWN} more")


def _verdict(result: PolicyResult) -> str:
    """The one line someone reads when they do not read the rest."""
    if result.passed and not result.warned:
        return "[green]Policy passed.[/]"
    if result.passed:
        return f"[yellow]Policy passed with {len(result.warned)} warning(s).[/]"
    return f"[red]Policy failed: {len(result.failed)} rule(s).[/]"


@app.command(rich_help_panel="CI and pipelines")
def check(
    target: Annotated[
        Path | None,
        typer.Argument(help="A file or folder to audit. Omit it when passing --report."),
    ] = None,
    policy: Annotated[
        Path | None,
        typer.Option("--policy", help="A YAML file of rules the documents must meet."),
    ] = None,
    report: Annotated[
        Path | None,
        typer.Option("--report", help="Check a report JSON already written, instead of auditing."),
    ] = None,
    markdown: Annotated[
        Path | None,
        typer.Option("--markdown", help="Write the result as Markdown, for a pull request."),
    ] = None,
    sarif: Annotated[
        Path | None,
        typer.Option("--sarif", help="Write the result as SARIF, for code scanning."),
    ] = None,
    out: OutDirOpt = DEFAULT_OUT,
    name: NameOpt = "complydoc-check",
    extractor: ExtractorOpt = None,
    password: PasswordOpt = "",
    jobs: JobsOpt = 0,
    sample: SampleOpt = None,
    timeout: TimeoutOpt = 0.0,
    config_dir: ConfigOpt = None,
    ocr: OcrOpt = True,
    recurse: RecurseOpt = True,
    quiet: QuietOpt = False,
    classifier: ClassifierOpt = None,
    classifier_threshold: ClassifierThresholdOpt = None,
) -> None:
    """Check documents against a policy file, and exit non-zero when they fail it.

    Each rule is one of the checks `cd.expect` offers, named in YAML. Every rule
    runs, so one run lists everything that failed rather than the first thing.
    Exits 1 when a rule of level `error` fails, 2 when the policy or the path
    cannot be read.
    """
    from complydoc.report.json_reader import load_report
    from complydoc.report.policy import (
        check_policy,
        read_policy,
        write_policy_markdown,
        write_policy_sarif,
    )

    if policy is None:
        errors.print("[bold red]No policy given.[/] Pass --policy policy.yaml.")
        raise typer.Exit(code=2)
    if (target is None) == (report is None):
        errors.print("[bold red]Pass a path to audit, or --report with a report JSON.[/]")
        raise typer.Exit(code=2)

    offline.arm()
    config = load_config_or_exit(config_dir)
    try:
        rules = read_policy(policy)
    except ConfigError as exc:
        errors.print(f"[bold red]Policy error[/]\n{escape(str(exc))}")
        raise typer.Exit(code=2) from exc

    if report is not None:
        try:
            audit = load_report(report)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            errors.print(f"[bold red]Cannot read the report[/] {report} — {escape(str(exc))}")
            raise typer.Exit(code=2) from exc
    else:
        assert target is not None
        if not target.exists():
            errors.print(f"[bold red]No such path:[/] {target}")
            raise typer.Exit(code=2)
        try:
            with classifying(classifier, classifier_threshold, jobs=jobs, config=config) as (
                config,
                jobs,
                notes,
            ):
                for note in notes:
                    errors.print(note)
                audit = run_audit(
                    target,
                    config,
                    COMPONENTS,
                    ocr=ocr,
                    recurse=recurse,
                    password=password,
                    extractor=extractor,
                    jobs=jobs,
                    sample=sample,
                    timeout=timeout or None,
                    classifier_spec=classifier,
                )
        except ClassifierError as exc:
            errors.print(f"[bold red]Cannot use that classifier[/] — {escape(str(exc))}")
            raise typer.Exit(code=2) from exc
        except UnknownModelError as exc:
            errors.print(f"[bold red]Unknown model[/] — {escape(str(exc))}")
            raise typer.Exit(code=2) from exc
        emit(audit, config, out, name, quiet)

    result = check_policy(audit, rules)
    written: list[tuple[str, Path]] = []
    if markdown is not None:
        written.append(("Markdown", write_policy_markdown(result, markdown)))
    if sarif is not None:
        written.append(("SARIF", write_policy_sarif(result, audit, sarif)))

    if not quiet:
        console.print(_rules_table(result))
        _print_failures(result)
        console.print()
        console.print(_verdict(result))
        for label, path in written:
            link(label, path)

    if result.failed:
        raise typer.Exit(code=1)
