"""`routing`: which extraction path each page needs, as a manifest a job can read."""

from __future__ import annotations

import sys

import typer
from rich.table import Table

from complydoc import offline
from complydoc.audit.run import run_audit
from complydoc.cli.common import (
    DEFAULT_OUT,
    ConfigOpt,
    ExtractorOpt,
    JobsOpt,
    ModelOpt,
    NameOpt,
    OcrOpt,
    OutDirOpt,
    PasswordOpt,
    PrintJsonOpt,
    QuietOpt,
    RecurseOpt,
    SampleOpt,
    TargetArg,
    TimeoutOpt,
    app,
    console,
    errors,
    link,
    load_config_or_exit,
    route_output,
)
from complydoc.cost.estimator import UnknownModelError


@app.command(rich_help_panel="Audit")
def routing(
    target: TargetArg,
    out: OutDirOpt = DEFAULT_OUT,
    name: NameOpt = "complydoc-routing",
    model: ModelOpt = None,
    extractor: ExtractorOpt = None,
    password: PasswordOpt = "",
    jobs: JobsOpt = 0,
    sample: SampleOpt = None,
    timeout: TimeoutOpt = 0.0,
    config_dir: ConfigOpt = None,
    ocr: OcrOpt = True,
    recurse: RecurseOpt = True,
    print_json: PrintJsonOpt = False,
    quiet: QuietOpt = False,
) -> None:
    """Plan how each page should be read: its text layer, local OCR, or a vision model.

    Writes a manifest an ingestion job can read, with a route and a reason for
    every page, and prices that mix against sending everything one way. Pages go
    to a vision model when plain text would lose them: a table with merged or
    stacked headers, a page that is mostly picture, a scan too coarse for OCR, or
    one OCR read poorly. The thresholds are in `readiness.yaml` under `routing`.
    """
    from complydoc.report.html_writer import write_html
    from complydoc.report.routing import routing_manifest, write_routing_json

    offline.arm()
    route_output(print_json)
    if print_json:
        quiet = True
    config = load_config_or_exit(config_dir)
    if not target.exists():
        errors.print(f"[bold red]No such path:[/] {target}")
        raise typer.Exit(code=2)

    try:
        report = run_audit(
            target,
            config,
            ("cost", "readiness"),
            ocr=ocr,
            recurse=recurse,
            password=password,
            extractor=extractor,
            select_models=model,
            jobs=jobs,
            sample=sample,
            timeout=timeout or None,
        )
    except UnknownModelError as exc:
        errors.print(f"[bold red]Unknown model[/] — {exc}\n\nRun 'complydoc models' to list them.")
        raise typer.Exit(code=2) from exc

    summary = report.routing
    manifest_path = write_routing_json(report, out / f"{name}.json")
    html_path = write_html(report, config, out / f"{name}.html")

    if print_json:
        import json

        sys.stdout.write(
            json.dumps(routing_manifest(report), indent=2, sort_keys=True, ensure_ascii=False)
            + "\n"
        )
        return
    if quiet or summary is None:
        return

    pages = Table(box=None, pad_edge=False)
    for column in ("Route", "Pages", "Documents"):
        pages.add_column(column, justify="left" if column == "Route" else "right")
    for route in ("text", "ocr", "vision"):
        pages.add_row(route, str(summary.pages.get(route, 0)), str(summary.documents.get(route, 0)))
    console.print(pages)

    costs = Table(box=None, pad_edge=False)
    costs.add_column("Every page")
    costs.add_column("Cost", justify="right")
    for label, value in (
        ("by the route it needs", summary.routed_usd),
        ("from its text layer", summary.text_layer_usd),
        ("text layer, scans through local OCR", summary.text_ocr_usd),
        ("as an image to a vision model", summary.vision_usd),
    ):
        costs.add_row(label, "—" if value is None else f"${value:,.4f}")
    console.print()
    console.print(costs)
    saved = summary.saved_against_vision_usd
    if saved:
        console.print(f"\n[dim]{summary.basis}[/]")
        console.print(
            f"Routing saves [bold]${saved:,.4f}[/] against sending every page as an image."
        )
    console.print()
    link("Manifest", manifest_path)
    link("Report", html_path)
