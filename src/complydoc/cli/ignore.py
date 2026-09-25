"""`ignore`: set a finding aside, with the reason it is not a problem."""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Annotated

import typer
from rich.markup import escape
from rich.table import Table

from complydoc.cli.common import app, console, errors
from complydoc.ignores import (
    IGNORE_FILENAME,
    IgnoreEntry,
    IgnoreError,
    add_ignore,
    load_ignores,
    remove_ignore,
    who,
)
from complydoc.report.models import AuditReport


def _described(report: AuditReport, fingerprint: str) -> str | None:
    """The finding in words, as the report shows it: "IBAN GB29 •••• 6819"."""
    for document in report.documents:
        for match in document.sensitive.matches if document.sensitive else []:
            if match.fingerprint == fingerprint:
                return f"{match.label} {match.masked}"
        for finding in document.content_findings:
            if finding.fingerprint == fingerprint:
                return f"Passage: {finding.excerpt[:80]}"
        for ignored in document.ignored:
            if ignored.fingerprint == fingerprint and ignored.identifier is not None:
                return f"{ignored.identifier.label} {ignored.identifier.masked}"
    return None


def _list(file: Path) -> None:
    entries = load_ignores(file).ignores
    if not entries:
        console.print(f"No findings are ignored in {escape(str(file))}.")
        return
    today = dt.date.today()
    table = Table(box=None, pad_edge=False)
    table.add_column("Finding", no_wrap=True)
    table.add_column("What")
    table.add_column("Reason")
    table.add_column("By")
    table.add_column("Until")
    for entry in entries:
        until = entry.until.isoformat() if entry.until else "—"
        if entry.expired_on(today):
            until = f"[red]{until}, expired[/]"
        table.add_row(
            entry.finding,
            escape(entry.what or "—"),
            escape(entry.reason),
            escape(entry.by or "—"),
            until,
        )
    console.print(table)


@app.command(rich_help_panel="CI and pipelines")
def ignore(
    finding: Annotated[
        str | None,
        typer.Argument(help="The finding's fingerprint, from a report: id-… or ct-…"),
    ] = None,
    reason: Annotated[
        str | None,
        typer.Option("--reason", "-r", help="Why it is not a problem. Required to add one."),
    ] = None,
    until: Annotated[
        str | None,
        typer.Option("--until", help="The date it stops applying, YYYY-MM-DD."),
    ] = None,
    paths: Annotated[
        list[str] | None,
        typer.Option("--path", help="Only in documents matching this glob. Repeatable."),
    ] = None,
    what: Annotated[
        str | None,
        typer.Option("--what", help="What the finding is, in words, for whoever reads the file."),
    ] = None,
    by: Annotated[
        str | None,
        typer.Option("--by", help="Who decided. Defaults to git's user.name."),
    ] = None,
    report: Annotated[
        Path | None,
        typer.Option("--report", help="A report JSON to describe the finding from."),
    ] = None,
    file: Annotated[
        Path,
        typer.Option("--file", help="The ignore file. Keep it at the top of the audited folder."),
    ] = Path(IGNORE_FILENAME),
    remove: Annotated[bool, typer.Option("--remove", help="Stop ignoring the finding.")] = False,
    list_: Annotated[bool, typer.Option("--list", help="List what is ignored.")] = False,
) -> None:
    """Set a finding aside, with the reason it is not a problem.

    Ignored findings stay in the report, marked as ignored with their reason, and
    leave every count and every policy rule, so `complydoc check` passes on them.
    The file holds fingerprints and reasons, never a value found.
    """
    try:
        if list_ or finding is None:
            _list(file)
            return
        if remove:
            removed = remove_ignore(file, finding)
            if not removed:
                errors.print(f"[bold red]{escape(finding)} is not ignored[/] in {file}.")
                raise typer.Exit(code=1)
            console.print(f"{escape(finding)} is counted again.")
            return
        if reason is None:
            errors.print("[bold red]An ignore needs a reason.[/] Pass --reason.")
            raise typer.Exit(code=2)
        if what is None and report is not None:
            from complydoc.report.json_reader import load_report

            what = _described(load_report(report), finding)
        entry = IgnoreEntry(
            finding=finding,
            reason=reason,
            by=by or who(),
            what=what,
            paths=list(paths or []),
            until=dt.date.fromisoformat(until) if until else None,
            added=dt.date.today(),
        )
        replaced = add_ignore(file, entry)
    except (IgnoreError, ValueError, OSError) as exc:
        errors.print(f"[bold red]Cannot ignore it[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc
    verb = "Updated" if replaced else "Ignored"
    console.print(f"{verb} {escape(finding)} in {escape(str(file))}.")
