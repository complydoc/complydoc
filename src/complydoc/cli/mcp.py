"""`complydoc mcp`: serve a folder to an AI assistant over MCP, documents masked on the way."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from complydoc.cli.common import app, errors


@app.command(rich_help_panel="Audit")
def mcp(
    folders: Annotated[
        list[Path] | None,
        typer.Option(
            "--folder",
            help=(
                "A folder the assistant may open documents from; give it once per folder. "
                "More can be chosen from the conversation. Nothing outside them is read."
            ),
        ),
    ] = None,
    fetch_name_model: Annotated[
        bool,
        typer.Option(
            "--fetch-name-model",
            help=(
                "Download the model that finds names of people and companies (about 700 MB) "
                "once, if it is missing. It needs the multilingual-names extra."
            ),
        ),
    ] = False,
    runs: Annotated[
        list[Path] | None,
        typer.Option(
            "--runs",
            help=(
                "A folder of complydoc reports, such as .complydoc; give it once per folder. "
                "Adds the tools for engineers: list_runs, show_run, compare_runs and find_value."
            ),
        ),
    ] = None,
) -> None:
    """Let an AI assistant open documents through complydoc, over MCP on stdio.

    Add `complydoc mcp --folder <dir>` to Claude Desktop or any MCP client.

    The assistant gets list_documents, check_document and open_document, and what it reads
    has personal and financial details masked and hidden passages taken out. choose_folder
    lets the person add a folder from the conversation, through the system's folder dialog.

    With `--runs .complydoc`, an engineer can also ask about recorded runs: step times of a
    pipeline, loaders compared, evals, and where a value went.
    """
    from complydoc.mcp import serve

    for folder in folders or []:
        if not folder.expanduser().is_dir():
            errors.print(f"Not a folder: {folder}")
            raise typer.Exit(2)
    serve(folders or [], fetch_name_model=fetch_name_model, runs=runs or [])
