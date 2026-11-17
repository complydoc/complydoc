"""`complydoc mcp`: serve a folder to an AI assistant over MCP, documents masked on the way."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from complydoc.cli.common import app, errors


@app.command(rich_help_panel="Audit")
def mcp(
    folder: Annotated[
        Path,
        typer.Option(
            "--folder",
            help="The folder the assistant may open documents from. Nothing outside it is read.",
        ),
    ] = Path("."),
) -> None:
    """Let an AI assistant open documents through complydoc, over MCP on stdio.

    Add `complydoc mcp --folder <dir>` to Claude Desktop or any MCP client.

    The assistant gets list_documents, check_document and open_document, and what it reads
    has personal and financial details masked and hidden passages taken out.
    """
    from complydoc.mcp import serve

    if not folder.expanduser().is_dir():
        errors.print(f"Not a folder: {folder}")
        raise typer.Exit(2)
    serve(folder)
