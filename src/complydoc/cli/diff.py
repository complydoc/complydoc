"""`diff`: what got worse and what got better between two report JSON files."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Annotated

import typer
from rich.markup import escape

from complydoc.cli.common import (
    NameOpt,
    PrintJsonOpt,
    QuietOpt,
    app,
    console,
    errors,
    link,
    route_output,
)
from complydoc.utils.text import count


@app.command()
def diff(
    old: Annotated[Path, typer.Argument(help="The earlier report JSON, such as a baseline.")],
    new: Annotated[Path, typer.Argument(help="The later report JSON.")],
    tolerance: Annotated[
        float,
        typer.Option("--tolerance", help="Ignore score changes smaller than this many points."),
    ] = 0.5,
    fail_on_regression: Annotated[
        bool,
        typer.Option(
            "--fail-on-regression/--no-fail-on-regression",
            help="Exit with status 1 when anything got worse. On by default, for CI.",
        ),
    ] = True,
    out: Annotated[
        Path | None,
        typer.Option("--out", "-o", help="Also write the changes as JSON and HTML here."),
    ] = None,
    name: NameOpt = "complydoc-diff",
    print_json: PrintJsonOpt = False,
    quiet: QuietOpt = False,
) -> None:
    """Compare two report JSON files and list what got worse and what got better.

    Documents are matched by relative path. A regression is an identifier,
    metadata finding or hidden passage that appeared, a score or text similarity
    that fell, a fact a loader no longer finds, a new network attempt or failed
    file, or a new important limitation. Exits 1 when there is a regression, 2
    when a file cannot be read.
    """
    from complydoc.report.compare import diff_reports
    from complydoc.report.json_reader import load_report
    from complydoc.report.pages import diff_to_dict, write_diff_html, write_diff_json

    route_output(print_json)
    if print_json:
        quiet = True
    reports = []
    for path in (old, new):
        try:
            reports.append(load_report(path))
        except (OSError, ValueError, KeyError, TypeError) as exc:
            errors.print(f"[bold red]Cannot read the report[/] {path} — {exc}")
            raise typer.Exit(code=2) from exc
    changes = diff_reports(reports[0], reports[1], score_tolerance=tolerance)

    if not quiet:
        for change in changes.changes:
            where = f"{change.document}: " if change.document else ""
            values = f" ({change.before} → {change.after})" if change.kind == "changed" else ""
            mark = "[red]worse [/]" if change.worse else "[green]better[/]"
            console.print(
                f"{mark} {change.area} {change.kind}: {escape(where + change.subject + values)}",
                crop=False,
            )
        regressions = len(changes.regressions)
        console.print(
            f"\n[bold]{count(regressions, 'regression')}[/], "
            f"{count(len(changes.improvements), 'improvement')}"
            if changes
            else "No changes."
        )
    if out is not None:
        html_path = write_diff_html(changes, out / f"{name}.html", old=old.name, new=new.name)
        json_path = write_diff_json(changes, out / f"{name}.json")
        if not quiet:
            console.print()
            link("Report", html_path)
            link("Data", json_path)
    if print_json:
        sys.stdout.write(json.dumps(diff_to_dict(changes), indent=2, default=str) + "\n")
    if fail_on_regression and changes.regressions:
        raise typer.Exit(code=1)
