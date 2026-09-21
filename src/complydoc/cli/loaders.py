"""`compare-loaders`: several document loaders on the same documents, from a YAML file."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from rich.markup import escape
from rich.table import Table

from complydoc.cli.common import (
    DEFAULT_OUT,
    ConfigOpt,
    NameOpt,
    OutDirOpt,
    PrintJsonOpt,
    QuietOpt,
    app,
    console,
    emit,
    errors,
    load_config_or_exit,
    print_report_json,
    route_output,
)
from complydoc.config.loader import ConfigError


@app.command("compare-loaders", rich_help_panel="Compare readers and loaders")
def compare_loaders_command(
    spec: Annotated[
        Path,
        typer.Argument(
            help="A YAML file naming the loaders, the documents and the expected facts."
        ),
    ],
    out: OutDirOpt = DEFAULT_OUT,
    name: NameOpt = "complydoc-loaders",
    config_dir: ConfigOpt = None,
    print_json: PrintJsonOpt = False,
    quiet: QuietOpt = False,
) -> None:
    """Run several document loaders on the same documents and report their differences.

    The file names each loader as `module:attribute` or a parser preset, the
    documents, and optionally the facts each loader's text should contain. The
    first loader is the baseline. Loaders run with network access blocked unless
    the file sets `allow_network: true`. See the Comparing loaders guide for the
    format.
    """
    from complydoc.loaders.spec_file import compare_from_file, read_comparison_file

    route_output(print_json)
    if print_json:
        quiet = True
    config = load_config_or_exit(config_dir)
    try:
        comparison = read_comparison_file(spec)
    except ConfigError as exc:
        errors.print(f"[bold red]Comparison file error[/]\n{escape(str(exc))}")
        raise typer.Exit(code=2) from exc
    if comparison.allow_network:
        errors.print(
            "[bold yellow]allow_network is set.[/] The loaders may send document content "
            "over the network. complydoc's own processing still runs with it blocked."
        )
    try:
        report = compare_from_file(spec, config=config)
    except (ImportError, ValueError, FileNotFoundError) as exc:
        errors.print(f"[bold red]Comparison failed[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc

    if not quiet and report.loader_comparison is not None:
        table = Table(box=None, pad_edge=False)
        columns = ("Loader", "From", "Documents", "Pages", "Failed files", "Network attempts")
        for column in columns:
            table.add_column(column, justify="left" if column in ("Loader", "From") else "right")
        with_facts = bool(comparison.facts)
        if with_facts:
            table.add_column("Facts found", justify="right")
        for row in report.loader_comparison.loaders:
            cells = [
                row.name,
                f"[dim]{', '.join(row.tags)}[/]" if row.tags else "[dim]—[/]",
                str(row.documents),
                str(row.pages),
                str(len(row.failures)),
                str(len(row.network_attempts)),
            ]
            if with_facts:
                cells.append(f"{row.facts_found or 0} of {len(comparison.facts)}")
            table.add_row(*cells)
        console.print(table)

        lc = report.loader_comparison
        if lc.recommended:
            console.print(f"\n[bold green]Use {lc.recommended}[/] — {escape(lc.verdict)}")
        elif lc.verdict:
            console.print(f"\n[yellow]No recommendation[/] — {escape(lc.verdict)}")
    emit(report, config, out, name, quiet)
    if print_json:
        print_report_json(report)
