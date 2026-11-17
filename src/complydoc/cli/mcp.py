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
) -> None:
    """Let an AI assistant open documents through complydoc, over MCP on stdio.

    Add `complydoc mcp --folder <dir>` to Claude Desktop or any MCP client.

    The assistant gets list_documents, check_document and open_document, and what it reads
    has personal and financial details masked and hidden passages taken out. choose_folder
    lets the person add a folder from the conversation, through the system's folder dialog.
    """
    from complydoc.mcp import serve

    for folder in folders or []:
        if not folder.expanduser().is_dir():
            errors.print(f"Not a folder: {folder}")
            raise typer.Exit(2)
    serve(folders or [])
