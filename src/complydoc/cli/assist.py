"""`assist`: draft quick wins from a finished report with a hosted chat model."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from rich.markup import escape

from complydoc.cli.common import QuietOpt, app, console, errors

__all__ = ["assist"]

_LARGE_PAYLOAD = 400_000
"""Characters of JSON past which the report is worth a word of warning.

About 100,000 tokens, which is where the cheaper context windows stop."""


@app.command(rich_help_panel="CI and pipelines")
def assist(
    report: Annotated[
        Path,
        typer.Option("--report", help="A report JSON already written by an audit."),
    ],
    model: Annotated[
        str,
        typer.Option("--model", help="Chat model id, passed to langchain's init_chat_model."),
    ] = "gpt-5.6-luna",
    quiet: QuietOpt = False,
) -> None:
    """Draft quick wins from a finished report with a hosted chat model.

    **Sends the report to `model`.** Everything else complydoc computes stays
    on this machine; `--classifier jev` is the only other command that leaves
    it, and only with the passages it judges. This one sends the report's
    findings, signals, loaders, costs and limitations, including masked
    identifiers and document paths. The page pictures and the text read off
    each page are held back. It never runs as part of `audit` or `check`; run
    it on its own, against a report one of those already wrote.
    """
    from complydoc import offline
    from complydoc.integrations.assistant import (
        connections_made,
        quick_wins_call,
        report_payload,
    )
    from complydoc.report.json_reader import load_report

    # Armed as every other command arms it, so the one call this command is for
    # is the only thing that can leave: it is made inside `offline.permitted()`,
    # and anything else the model client tries is blocked and reported.
    offline.arm()

    try:
        audit = load_report(report)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.print(f"[bold red]Cannot read the report[/] {report} — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc

    if not quiet:
        errors.print(
            f"[bold yellow]complydoc assist sends this report to {model!r}.[/] "
            "Nothing else in complydoc does this without --classifier."
        )

    payload_chars = len(report_payload(audit))
    if payload_chars > _LARGE_PAYLOAD and not quiet:
        errors.print(
            f"[yellow]This report is large[/] ({payload_chars:,} characters of JSON, "
            f"roughly {payload_chars // 4:,} tokens). A model with less room than that "
            f"will refuse it. Audit with --sample to describe the folder in fewer "
            f"documents."
        )

    try:
        message = quick_wins_call(audit, allow_network=True, model=model)
    except ImportError as exc:
        errors.print(f"[bold red]Cannot run the assistant[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc
    except ValueError as exc:
        errors.print(f"[bold red]{escape(str(exc))}[/]")
        raise typer.Exit(code=2) from exc
    except Exception as exc:
        # The model client's own errors (auth, timeout, rate limit) are not
        # complydoc's to type; shown plainly instead of as a raw traceback.
        errors.print(f"[bold red]The model call failed[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc

    hosts = connections_made()
    if hosts and not quiet:
        errors.print(f"[dim]Sent to: {escape(', '.join(hosts))}[/]")

    if not message.quick_wins:
        if not quiet:
            console.print("[dim]No quick wins drafted.[/]")
        return

    for win in message.quick_wins:
        console.print(f"[bold]-[/] {escape(win.quick_win)}")
        console.print(f"  [dim]{escape(win.justification)}[/]")
