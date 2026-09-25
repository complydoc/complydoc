"""`ui`: the report viewer on this machine, over a folder of reports."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from rich.markup import escape

from complydoc.cli.common import DEFAULT_OUT, app, console, errors
from complydoc.utils.text import count


@app.command(rich_help_panel="Audit")
def ui(
    sources: Annotated[
        list[Path] | None,
        typer.Argument(
            help="Report files, or folders to search for them. Defaults to .complydoc, "
            "where an audit writes when no --out is given.",
            show_default=False,
        ),
    ] = None,
    port: Annotated[
        int,
        typer.Option("--port", "-p", help="Port to serve on; the next free one is used if taken."),
    ] = 8500,
    browser: Annotated[
        bool,
        typer.Option("--browser/--no-browser", help="Open the viewer in the browser."),
    ] = True,
) -> None:
    """Open the report viewer on the reports in a folder, served from this machine.

    Every audit report found is listed, grouped by the folder it audited, newest
    run first, and a report written while the viewer runs appears on reload. The
    server listens on 127.0.0.1 only and makes no outbound connection. Ctrl+C
    stops it.
    """
    from complydoc.viewer import ViewerNotBuiltError, find_reports, launch_ui

    folders = sources or [DEFAULT_OUT]
    found = find_reports(*folders)
    try:
        viewer = launch_ui(*folders, port=port, open_browser=False, block=False)
    except ViewerNotBuiltError as exc:
        errors.print(f"[bold red]Cannot start the viewer[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc
    except OSError as exc:
        errors.print(f"[bold red]Cannot start the viewer[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc

    where = ", ".join(str(folder) for folder in folders)
    if found:
        console.print(f"{count(len(found), 'report')} in {escape(where)}")
    else:
        console.print(
            f"No reports in {escape(where)} yet. Run [bold]complydoc audit ./documents[/] "
            "and reload the page."
        )
    console.print(
        f"[bold]Viewer[/]  [link={viewer.url}]{viewer.url}[/link]  [dim]Ctrl+C stops it[/]"
    )
    if browser:
        import webbrowser

        webbrowser.open(viewer.url)
    try:
        viewer.wait()
    except KeyboardInterrupt:
        console.print("Stopped.")
    finally:
        viewer.stop()
