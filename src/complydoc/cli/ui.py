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
            help="Report files, or folders to search for them: on this machine, or in a "
            "bucket as s3://bucket/folder. Defaults to .complydoc, where an audit writes "
            "when no --out is given.",
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
    host: Annotated[
        str,
        typer.Option(
            "--host",
            help="Address to listen on. The default is this machine only; 0.0.0.0 serves "
            "the reports to whoever can reach it, read-only and with no sign-in.",
        ),
    ] = "127.0.0.1",
    read_only: Annotated[
        bool | None,
        typer.Option(
            "--read-only/--allow-edits",
            help="Whether the viewer may change the ignore, concepts and categories files. "
            "Read-only by default when --host serves it to others.",
            show_default=False,
        ),
    ] = None,
    allowed_host: Annotated[
        list[str] | None,
        typer.Option(
            "--allowed-host",
            metavar="NAME",
            help="A name the viewer is reached by, beside this machine's own, such as the "
            "one a proxy serves it under. Repeat for several; * accepts every name.",
            show_default=False,
        ),
    ] = None,
) -> None:
    """Open the report viewer on the reports in a folder, served from this machine.

    Every audit report found is listed, grouped by the folder it audited, newest
    run first, and a report written while the viewer runs appears on reload. The
    server listens on 127.0.0.1 only and makes no outbound connection. Ctrl+C
    stops it.

    A folder of documents with no report in it is audited first, as `demo` audits
    its samples, and the viewer opens on the report. The audit runs here, before
    the server starts.

    With --host it serves a team: everyone who can reach the address reads the
    same reports. It has no sign-in, so put it on a network you trust or behind
    your own proxy.
    """
    folders: list[Path] = []
    for source in sources or [DEFAULT_OUT]:
        source = audited(source)
        if source not in folders:
            folders.append(source)
    serve_viewer(
        folders,
        port=port,
        browser=browser,
        host=host,
        read_only=read_only,
        allowed_hosts=allowed_host or [],
    )


def audited(source: Path) -> Path:
    """Where the viewer finds the reports for `source`, auditing it first when it needs one.

    A folder on this machine that holds documents and no report is read the way `demo`
    reads its samples, with each page's text kept and pypdf compared, and its report is
    written to `.complydoc/<folder name>.json`. A report already written there for the
    same folder is opened as it is. Anything else, a report, a folder of reports or a
    bucket, is returned unchanged.
    """
    from complydoc.audit.discovery import discover
    from complydoc.viewer.server import find_reports

    if not source.is_dir() or find_reports(source) or not discover(source)[0]:
        return source
    folder = source.resolve()
    name = folder.name or "complydoc"
    report = DEFAULT_OUT / f"{name}.json"
    earlier = find_reports(report) if report.is_file() else []
    if earlier and Path(earlier[0].target).resolve() == folder:
        console.print(
            f"[dim]Opening the report on {escape(str(source))} from earlier. "
            f"complydoc audit {escape(str(source))} --out {DEFAULT_OUT} --name {escape(name)} "
            "reads it again.[/]"
        )
        return report
    from complydoc.audit.run import COMPONENTS
    from complydoc.cli.audits import run

    console.print(f"[dim]No report on {escape(str(source))} yet: auditing it first.[/]")
    run(
        source,
        COMPONENTS,
        DEFAULT_OUT,
        name,
        None,
        True,
        True,
        False,
        extracted_text=True,
        # What the diff shows; the same comparison `demo` makes.
        compare_extractors=["pypdf"],
    )
    return report


def in_container() -> bool:
    """Whether this is running in a container, where its own address is not the reader's."""
    return Path("/.dockerenv").exists() or Path("/run/.containerenv").exists()


def serve_viewer(
    folders: list[Path],
    *,
    port: int = 8500,
    browser: bool = True,
    host: str = "127.0.0.1",
    read_only: bool | None = None,
    allowed_hosts: list[str] | None = None,
) -> None:
    """Serve the viewer on the reports in `folders` until Ctrl+C."""
    from complydoc import storage
    from complydoc.viewer import ViewerNotBuiltError, launch_ui

    try:
        # A path with its slashes collapsed by the command line, back as the address it was.
        sources = [str(storage.remote_folder(folder) or folder) for folder in folders]
        viewer = launch_ui(
            *sources,
            port=port,
            open_browser=False,
            block=False,
            host=host,
            read_only=read_only,
            allowed_hosts=allowed_hosts or [],
            uploads=DEFAULT_OUT / "uploads",
        )
    except ViewerNotBuiltError as exc:
        errors.print(f"[bold red]Cannot start the viewer[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc
    except (OSError, storage.StorageError) as exc:
        errors.print(f"[bold red]Cannot start the viewer[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc

    found = viewer.reports()
    for problem in viewer.storage_errors:
        errors.print(f"[bold red]Cannot read the bucket[/] — {escape(problem)}")
    where = ", ".join(sources)
    if found:
        console.print(f"{count(len(found), 'report')} in {escape(where)}")
    else:
        console.print(
            f"No reports in {escape(where)} yet. "
            + (
                "Drop documents on the page, or run [bold]complydoc ui ./documents[/]."
                if viewer.uploads
                else "Run [bold]complydoc ui ./documents[/] to audit a folder and open it."
            )
        )
    if viewer.shared and in_container():
        # Its own name and port mean nothing outside it: say what does.
        console.print(
            f"[bold]Viewer[/]  on port {viewer.port} of this container: open the address you "
            f"published it on, such as http://localhost:{viewer.port}/"
        )
    else:
        console.print(
            f"[bold]Viewer[/]  [link={viewer.url}]{viewer.url}[/link]  [dim]Ctrl+C stops it[/]"
        )
    if viewer.shared:
        edits = (
            "It is read-only."
            if viewer.read_only
            else "[yellow]They can also change the ignore, concepts and categories files.[/]"
        )
        console.print(
            f"[yellow]Served on {escape(viewer.host)}:[/] anyone who can reach it reads these "
            f"reports, with no sign-in. {edits}"
        )
        console.print(
            f"[dim]It answers to this machine's names and addresses, on port {viewer.port}. "
            "For another name, such as a proxy's, add --allowed-host NAME.[/]"
        )
    elif viewer.read_only:
        console.print("[dim]Read-only: the viewer changes no file.[/]")
    if viewer.uploads:
        console.print(
            f"[dim]Documents dropped on the page are copied to {escape(str(viewer.uploads))} "
            "and audited here.[/]"
        )
    if browser and not viewer.shared:
        import webbrowser

        webbrowser.open(viewer.url)
    try:
        viewer.wait()
    except KeyboardInterrupt:
        console.print("Stopped.")
    finally:
        viewer.stop()
