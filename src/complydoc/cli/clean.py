"""`clean`: write safe copies of documents, with identifiers masked."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from rich.table import Table

from complydoc import offline
from complydoc.cli.common import (
    ConfigOpt,
    QuietOpt,
    RecurseOpt,
    app,
    console,
    errors,
    load_config_or_exit,
)


@app.command()
def clean(
    target: Annotated[Path, typer.Argument(help="A file or folder to copy safely.")],
    out: Annotated[
        Path,
        typer.Option("--out", help="Where the copies are written."),
    ],
    rasterise: Annotated[
        bool,
        typer.Option(
            "--rasterise",
            help="PDFs only: render each page to an image, so no text layer survives.",
        ),
    ] = False,
    recurse: RecurseOpt = True,
    config_dir: ConfigOpt = None,
    quiet: QuietOpt = False,
) -> None:
    """Copy documents with their identifiers masked and their metadata removed."""
    offline.arm()
    from complydoc.cleaning import clean_document

    config = load_config_or_exit(config_dir)
    source = target.expanduser()
    if not source.exists():
        errors.print(f"[bold red]No such path:[/] {source}")
        raise typer.Exit(2)

    if source.is_file():
        paths = [source]
    else:
        pattern = "**/*" if recurse else "*"
        paths = sorted(path for path in source.glob(pattern) if path.is_file())
    if not paths:
        errors.print(f"[bold red]Nothing to copy[/] in {source}")
        raise typer.Exit(2)

    results = [clean_document(path, out, config, rasterise=rasterise) for path in paths]
    written = [result for result in results if result.written]
    skipped = [result for result in results if not result.written]

    if quiet:
        return

    table = Table(box=None, pad_edge=False)
    table.add_column("Document")
    table.add_column("Masked", justify="right")
    table.add_column("Metadata removed")
    for result in results:
        if result.written:
            table.add_row(
                result.source.name,
                str(result.masked),
                ", ".join(result.metadata_removed) or "—",
            )
        else:
            table.add_row(result.source.name, "—", f"[yellow]{result.skipped}[/]")
    console.print(table)

    notes = {note for result in results for note in result.notes}
    for note in sorted(notes):
        console.print(f"[dim]{note}[/]")

    unscanned = {
        category: reason
        for result in results
        for category, reason in result.unscanned_categories.items()
    }
    if unscanned:
        # A category nothing was looked for was masked nowhere in these copies.
        console.print(
            f"[yellow]Not scanned:[/] {', '.join(sorted(unscanned))} — nothing of that kind "
            f"was masked in any copy."
        )

    console.print()
    console.print(f"[bold]Copies[/]  {len(written)} written to {out.expanduser().resolve()}")
    if skipped:
        console.print(f"[yellow]{len(skipped)} not copied[/]")
