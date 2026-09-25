"""Commands about the installation and its catalogues: `skill`, `schema`, `doctor`,
`models`, `extractors`, `engines` and `pricing-import`."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from complydoc.config.schema import Config

import sys
from pathlib import Path
from typing import Annotated

import typer

# Install hints carry `complydoc[ocr]`, which Rich would read as markup and drop.
from rich.markup import escape
from rich.table import Table

from complydoc import __version__, offline
from complydoc.cli.common import ConfigOpt, app, console, errors, load_config_or_exit
from complydoc.utils.text import count


@app.command(rich_help_panel="Information")
def skill(
    install: Annotated[
        bool,
        typer.Option("--install", help="Copy the skill into ~/.claude/skills/complydoc."),
    ] = False,
    target: Annotated[
        Path | None, typer.Option("--to", help="Install somewhere other than ~/.claude/skills.")
    ] = None,
) -> None:
    """Print the agent skill, or install it so an agent picks complydoc up on its own."""
    import shutil
    from importlib.resources import files

    source = files("complydoc.skill").joinpath("SKILL.md")
    if not install:
        console.print(source.read_text(encoding="utf-8"))
        console.print("\n[dim]Install it with:  complydoc skill --install[/]", highlight=False)
        return

    root = (target or Path.home() / ".claude" / "skills") / "complydoc"
    root.mkdir(parents=True, exist_ok=True)
    destination = root / "SKILL.md"
    with source.open("rb") as handle, destination.open("wb") as out:
        shutil.copyfileobj(handle, out)
    console.print(f"Installed  [link=file://{destination}]{destination}[/link]", no_wrap=True)
    console.print("[dim]Start a new agent session for it to be picked up.[/]")


@app.command(rich_help_panel="Information")
def schema() -> None:
    """Print the JSON schema of the report, for a caller that needs to parse it."""
    import json

    from complydoc.report.models import report_shape

    # Printed rather than sent through the console: that wraps to the width of
    # the terminal, which breaks a long string across two lines and hands a
    # caller a document that will not parse.
    print(json.dumps(report_shape(), indent=2))


def _report_name_detection(config: Config) -> None:
    """What reads names, in the order the configuration tries them.

    A category names several detectors and uses the first that can run, so the
    question this answers is "are names being found, and by what". Listing each
    configured model on its own line answered neither: a missing preferred model
    beside a working fallback read as a broken install when nothing was wrong.
    """
    from complydoc.sensitive.detectors import ner, token_classifier

    modules = {"ner": ner, "token_classifier": token_classifier}
    seen: set[tuple[str, str]] = set()

    for category in config.sensitive.enabled_categories.values():
        if not category.model_backed:
            continue
        links = [(d, link) for d, link in category.chain() if link.model is not None]
        if not any(link for _, link in links):
            continue
        key = tuple(link.model.name for _, link in links if link.model)
        if key in seen:
            continue
        seen.add(key)  # type: ignore[arg-type]

        # Gathered before anything is printed: the model that answers goes
        # first, and the rest under it. Printed in chain order, a missing
        # preferred model is the first thing read and looks like the answer.
        answering: str | None = None
        others: list[str] = []
        fixes: list[str] = []
        for detector_id, link in links:
            if link.model is None:
                continue
            module = modules.get(detector_id)
            ok, reason = module.model_available(link.model.name) if module else (True, None)
            if ok and answering is None:
                answering = link.model.name
            elif ok:
                others.append(f"spare: {link.model.name}")
            else:
                others.append(f"not installed: {link.model.name}")
                if reason:
                    fixes.append(f"{link.model.name}: {reason}")

        if answering is None:
            console.print("Name detection: [yellow]unavailable[/] — no configured model loads")
            # Nothing reads names, so say how to fix that rather than only what is missing.
            others = [*others, *(f"to add {fix}" for fix in fixes)]
        else:
            console.print(f"Name detection: [green]{answering}[/]")
        for line in others:
            console.print(f"[dim]  {escape(line)}[/]")


@app.command(rich_help_panel="Information")
def doctor(config_dir: ConfigOpt = None) -> None:
    """Report what is installed, what is not, and what that costs you."""
    offline.arm()
    from complydoc.cost.tokenizer import available_encodings
    from complydoc.ingest import ocr as ocr_module
    from complydoc.ingest.registry import supported_extensions

    config = load_config_or_exit(config_dir)
    console.print(f"[bold]complydoc {__version__}[/] on Python {sys.version.split()[0]}")
    console.print(f"Network guard: [green]{offline.guard_status()}[/]")
    console.print(f"Config: {config.source_dir} (digest {config.digest})")
    console.print(f"Formats: {', '.join(supported_extensions())}")
    console.print(f"Tokenizer vocabularies vendored: {len(available_encodings())}")

    if ocr_module.available():
        console.print(f"OCR: [green]available[/] ({ocr_module.engine_name()})")
    else:
        console.print(
            f"OCR: [yellow]unavailable[/] — {escape(ocr_module.unavailable_reason() or '')}"
        )

    _report_name_detection(config)

    from complydoc.config.loader import check_staleness

    warnings = check_staleness(config.pricing)
    for warning in warnings:
        console.print(f"[yellow]Prices:[/] {escape(warning.message)}")
    if not warnings:
        taken = next(
            (m.imported_on for m in config.pricing.models if m.enabled and m.imported_on), None
        )
        when = f"as of {taken.isoformat()}" if taken else "of an unknown date"
        console.print(f"Prices: [green]{when}[/], one table for every model")


@app.command(rich_help_panel="Information")
def models(
    match: Annotated[
        str | None,
        typer.Argument(help="Show only models whose id contains this."),
    ] = None,
    provider: Annotated[
        str | None, typer.Option("--provider", help="Show only one provider's models.")
    ] = None,
    show_all: Annotated[
        bool, typer.Option("--all", help="Include every model in the vendored price table.")
    ] = False,
    new: Annotated[
        int | None,
        typer.Option("--new", help="Show the N most recently released models instead."),
    ] = None,
    config_dir: ConfigOpt = None,
) -> None:
    """List the models available to price against, and the date of their prices.

    Every price comes from the vendored price table, refreshed each week. The
    default comparison is each provider's current line-up; the rest of the table
    can be named with --model.
    """
    import datetime as dt

    from complydoc.cost.price_table import released_on, table_provenance

    config = load_config_or_exit(config_dir)
    pricing = config.pricing
    today = dt.date.today()

    chosen = list(pricing.models)
    filtered = bool(match or provider or new)
    if match:
        chosen = [m for m in chosen if match.lower() in m.id.lower()]
    if provider:
        chosen = [m for m in chosen if m.provider.lower() == provider.lower()]
    if new:
        # Newest first, and only models the catalogue dates. A model with no
        # release date is not assumed to be old; it is simply not ranked.
        dated = [(released_on(m.id), m) for m in chosen]
        chosen = [
            m
            for date, m in sorted(
                ((d, m) for d, m in dated if d), key=lambda pair: pair[0], reverse=True
            )
        ][:new]
    elif not filtered and not show_all:
        chosen = [m for m in chosen if m.enabled]

    if not chosen:
        errors.print("[yellow]No model matches.[/] Try [bold]complydoc models --all[/].")
        raise typer.Exit(code=1)

    table = Table(box=None, pad_edge=False)
    table.add_column("Model id")
    table.add_column("Provider")
    table.add_column("Input $/Mtok", justify="right")
    table.add_column("Batch", justify="right")
    table.add_column("Takes images")
    table.add_column("Released")
    table.add_column("Price as of")

    for entry in chosen:
        as_of = entry.imported_on or entry.last_verified
        if not entry.is_priced:
            state = "[yellow]no price[/]"
        elif as_of is None:
            state = "[red]no date[/]"
        elif (today - as_of).days > pricing.staleness_warn_days:
            state = f"[red]{as_of.isoformat()} ({(today - as_of).days}d)[/]"
        else:
            state = f"[dim]{as_of.isoformat()}[/]"
        table.add_row(
            entry.id if entry.enabled else f"[dim]{entry.id}[/]",
            entry.provider,
            f"{entry.input_per_mtok_usd:g}" if entry.is_priced else "—",
            f"{entry.batch_input_per_mtok_usd:g}" if entry.has_batch_price else "—",
            "yes" if entry.supports_vision else "[dim]text only[/]",
            (released_on(entry.id) or "—").__str__(),
            state,
        )
    console.print(table)

    source, imported_on, total = table_provenance()
    enabled = sum(1 for m in pricing.models if m.enabled)
    if not filtered and not show_all:
        console.print(
            f"\n[dim]Showing the {enabled} compared by default. {total} are in the "
            f"catalogue — [/][bold]complydoc models --new 15[/][dim] for the most "
            f"recently released, [/][bold]--all[/][dim], or search: "
            f"[/][bold]complydoc models gpt[/][dim].[/]"
        )
    console.print(
        f"\n[dim]Price one model with [/][bold]--model <id>[/][dim], repeat for several. "
        f"Prices come from {source} as of "
        f"{imported_on.isoformat() if imported_on else 'an unknown date'}; refresh with "
        f"[/][bold]make prices[/][dim].[/]"
    )


@app.command(rich_help_panel="Compare readers and loaders")
def extractors() -> None:
    """List the libraries that can read a PDF's text layer, and what each provides."""
    from complydoc.ingest.extractors.registry import DEFAULT_EXTRACTOR, all_extractors

    table = Table(box=None, pad_edge=False)
    table.add_column("Id")
    table.add_column("Boxes")
    table.add_column("Reads tables")
    table.add_column("Available")

    for engine in all_extractors():
        table.add_row(
            f"{engine.id}[dim] (default)[/]" if engine.id == DEFAULT_EXTRACTOR else engine.id,
            "[dim]none[/]" if engine.granularity == "none" else f"per {engine.granularity}",
            "yes" if engine.provides_tables else "[dim]no[/]",
            "yes" if engine.available() else "[yellow]no[/]",
        )
    console.print(table)
    console.print(
        "\n[dim]Pick one with [/][bold]--extractor <id>[/][dim], or read every page with a "
        "second and report where they differ: [/][bold]--compare-extractor <id>[/][dim].\n"
        "A signal needing what an extractor does not provide is reported as not measured.[/]"
    )


@app.command(rich_help_panel="Compare readers and loaders")
def engines() -> None:
    """List the local OCR engines."""
    from complydoc.ingest.engines.registry import DEFAULT_ENGINE, all_engines

    table = Table(box=None, pad_edge=False)
    table.add_column("Id")
    table.add_column("Engine")
    table.add_column("Available")

    for engine in all_engines():
        reason = engine.unavailable_reason()
        table.add_row(
            f"{engine.id}[dim] (default)[/]" if engine.id == DEFAULT_ENGINE else engine.id,
            engine.name,
            "yes" if reason is None else f"[yellow]{escape(reason)}[/]",
        )
    console.print(table)
    console.print("\n[dim]Pick one with [/][bold]--ocr-engine <id>[/][dim].[/]")


# A maintainer's tool for refreshing the vendored prices: kept, but off the help.
@app.command("pricing-import", hidden=True)
def pricing_import(
    source: Annotated[
        Path | None,
        typer.Option("--from", help="Path to litellm's model_prices_and_context_window JSON."),
    ] = None,
    model: Annotated[
        list[str] | None,
        typer.Option("--model", "-m", help="Model id to import, repeatable."),
    ] = None,
    provider: Annotated[
        str | None, typer.Option("--provider", help="Import every vision model from one provider.")
    ] = None,
    limit: Annotated[int, typer.Option("--limit", help="Cap how many are printed.")] = 20,
) -> None:
    """Print pricing.yaml entries generated from litellm's price table.

    complydoc will not invent a price, so the shipped config leaves non-Anthropic
    models as empty templates. This fills them in from a maintained source and
    stamps each with the date you ran the import.

    litellm is not a runtime dependency and is never imported during an audit —
    only its data file is read, and only when you run this.
    """
    from complydoc.cost.pricing_import import (
        PricingImportError,
        load_table,
        select,
        to_yaml,
    )

    if not model and not provider:
        errors.print(
            "[bold red]Nothing selected.[/] Pass --model <id> (repeatable) or "
            "--provider <name>. Run with --provider anthropic to see the shape."
        )
        raise typer.Exit(code=2)

    try:
        table = load_table(source)
        chosen = select(table, ids=model, provider=provider, limit=limit)
    except PricingImportError as exc:
        errors.print(f"[bold red]Import failed[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc

    if not chosen:
        errors.print("[yellow]Nothing matched.[/] Try a different --provider or --model.")
        raise typer.Exit(code=1)

    errors.print(
        f"[dim]# {count(len(chosen), 'model')} from {len(table)} in the table. "
        f"Paste under `models:` in pricing.yaml.[/]"
    )
    print(to_yaml(chosen))
