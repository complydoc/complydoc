"""Commands about the installation and its catalogues: `skill`, `schema`, `doctor`,
`models`, `extractors`, `engines` and `pricing-import`."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Annotated

import typer
from rich.table import Table

from complydoc import __version__, offline
from complydoc.cli.common import ConfigOpt, app, console, errors, load_config_or_exit
from complydoc.utils.text import count


@app.command()
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


@app.command()
def schema() -> None:
    """Print the JSON schema of the report, for a caller that needs to parse it."""
    import json

    from complydoc.report.models import report_shape

    console.print(json.dumps(report_shape(), indent=2))


@app.command()
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
        console.print(f"OCR: [yellow]unavailable[/] — {ocr_module.unavailable_reason()}")

    from complydoc.sensitive.detectors import ner, token_classifier

    # A category can be pointed at either detector, so both are asked. Reporting
    # only the shipped one would leave a configured model out of this list.
    for module in (ner, token_classifier):
        for name in module.configured_models(config.sensitive):
            ok, reason = module.model_available(name)
            if ok:
                console.print(f"Name detection: [green]available[/] ({name})")
            else:
                console.print(f"Name detection: [yellow]unavailable[/] — {reason}")

    from complydoc.config.loader import check_staleness

    warnings = check_staleness(config.pricing)
    if warnings:
        for warning in warnings:
            console.print(f"[yellow]Price provenance:[/] {warning.message}")
    else:
        console.print("Price provenance: [green]all enabled models verified recently[/]")


@app.command()
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
    """List the models available to price against, and where each price came from.

    The default comparison uses prices verified against the provider's own page.
    Several hundred more from the vendored table can be named with --model.
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
    table.add_column("Price from")

    for entry in chosen:
        if not entry.is_priced:
            state = "[yellow]no price[/]"
        elif entry.price_source == "imported":
            when = entry.imported_on.isoformat() if entry.imported_on else "unknown date"
            state = f"[dim]imported {when}[/]"
        else:
            age = entry.days_since_verified(today)
            if age is None:
                state = "[red]never verified[/]"
            elif age > pricing.staleness_warn_days:
                state = f"[red]verified {entry.last_verified} ({age}d)[/]"
            else:
                state = f"verified {entry.last_verified}"
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
        f"Imported prices come from {source} as of "
        f"{imported_on.isoformat() if imported_on else 'an unknown date'}; refresh with "
        f"[/][bold]make prices[/][dim].[/]"
    )


@app.command()
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


@app.command()
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
            "yes" if reason is None else f"[yellow]{reason}[/]",
        )
    console.print(table)
    console.print("\n[dim]Pick one with [/][bold]--ocr-engine <id>[/][dim].[/]")


@app.command("pricing-import")
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
        errors.print(f"[bold red]Import failed[/] — {exc}")
        raise typer.Exit(code=2) from exc

    if not chosen:
        errors.print("[yellow]Nothing matched.[/] Try a different --provider or --model.")
        raise typer.Exit(code=1)

    errors.print(
        f"[dim]# {count(len(chosen), 'model')} from {len(table)} in the table. "
        f"Paste under `models:` in pricing.yaml.[/]"
    )
    print(to_yaml(chosen))
