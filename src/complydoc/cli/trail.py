"""`find`: where a value went, across the reports in a folder."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

import typer
from rich.markup import escape

from complydoc.cli.common import DEFAULT_OUT, app, console
from complydoc.utils.text import count


@app.command(rich_help_panel="Audit")
def find(
    value: Annotated[
        str | None,
        typer.Argument(
            help="The value as it is written, such as an account number or a name, or a "
            "finding's fingerprint. Left out, it is asked for without being shown, "
            "which also keeps it out of your shell history.",
            show_default=False,
        ),
    ] = None,
    sources: Annotated[
        list[Path] | None,
        typer.Option(
            "--in",
            help="Report files, or folders to search for them. Repeat for several. "
            "Defaults to .complydoc.",
            show_default=False,
        ),
    ] = None,
    print_json: Annotated[bool, typer.Option("--json", help="Print the result as JSON.")] = False,
) -> None:
    """Find every document, pipeline step and host a value reached.

    Reports hold a fingerprint of each identifier they found, never the value. The
    value you give is hashed the same way and the reports are searched for it, so it
    is not written anywhere, and the answer comes from reports that never held it.
    """
    from complydoc.ledger import find_value

    if value is None:
        value = typer.prompt("Value to find", hide_input=True)
    trail = find_value(value, *(sources or [DEFAULT_OUT]))
    if print_json:
        print(json.dumps(trail.to_dict(), indent=2))
        return
    searched = count(trail.reports_searched, "report")
    if not trail.found:
        console.print(
            f"Not found in {searched}. A value is found only where a run looked for its "
            "kind and read it the same way it is written here."
        )
        raise typer.Exit(code=1)
    console.print(
        f"[bold]{escape(trail.label or 'Identifier')}[/]  {escape(trail.masked or '')}  "
        f"[dim]in {count(len(trail.runs), 'run')} of {searched}[/]"
    )
    for run in trail.runs:
        commit = f"  [dim]{run.commit[:7]}[/]" if run.commit else ""
        when = run.started_at[:16].replace("T", " ")
        console.print(f"\n[bold]{escape(run.name)}[/]  [dim]{run.kind}, {when}[/]{commit}")
        for document in run.documents:
            pages = ", ".join(map(str, document.pages))
            where = f"page {pages}" if len(document.pages) == 1 else f"pages {pages}"
            console.print(f"  [dim]in[/]       {escape(document.path)}  [dim]{where}[/]")
        for step in run.steps:
            if step.held:
                sent = f"  [yellow]→ {escape(', '.join(step.hosts))}[/]" if step.hosts else ""
                console.print(
                    f"  [dim]{step.step:>2}[/]  {escape(step.component)}  "
                    f"[dim]{step.kind}, {count(step.occurrences, 'time')}[/]{sent}"
                )
            else:
                console.print(f"  [dim]{step.step:>2}  {escape(step.component)}  not there[/]")
        if run.sent_to:
            console.print(f"  [yellow]sent to[/]  {escape(', '.join(run.sent_to))}")
