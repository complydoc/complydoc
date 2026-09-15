"""Command line interface.

Four commands. `audit` runs everything; `cost`, `readiness` and `sensitive` run
one component each.

The network guard is armed before any document is opened, on every path.
"""

from __future__ import annotations

import contextlib
import sys
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)
from rich.table import Column, Table

from complydoc import __version__, offline
from complydoc.audit.run import COMPONENTS, run_audit
from complydoc.config.loader import ConfigError, load_config
from complydoc.config.schema import Config
from complydoc.cost.estimator import UnknownModelError
from complydoc.report.html_writer import write_html
from complydoc.report.json_writer import write_json
from complydoc.report.models import AuditReport
from complydoc.utils.text import count

app = typer.Typer(
    add_completion=False,
    no_args_is_help=False,
    help=(
        "Audit a folder of business documents offline: what they would cost to process "
        "with an LLM, how hard they are to extract from, and what sensitive information "
        "they contain. No document content ever leaves this machine."
    ),
)
console = Console()
errors = Console(stderr=True)


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context) -> None:
    """Run `complydoc` on its own to audit the folder you are standing in.

    Anything more specific is a subcommand: `complydoc audit <path>`, `cost`,
    `readiness`, `sensitive`, `models`, `schema`, `doctor`.
    """
    if ctx.invoked_subcommand is not None:
        return
    here = Path.cwd()
    console.print(f"[dim]Auditing[/] {here}")
    _run(
        here,
        COMPONENTS,
        DEFAULT_OUT,
        "complydoc",
        None,
        True,
        True,
        False,
    )


TargetArg = Annotated[Path, typer.Argument(help="A file or folder to audit.")]
OutDirOpt = Annotated[
    Path,
    typer.Option("--out", "-o", help="Directory for the reports."),
]
DEFAULT_OUT = Path(".complydoc")
"""Hidden, so a second run does not discover the first run's own reports."""
ConfigOpt = Annotated[
    Path | None, typer.Option("--config-dir", help="Override the config directory.")
]
OcrOpt = Annotated[
    bool,
    typer.Option(
        "--ocr/--no-ocr",
        help="Read scanned pages with local OCR. On by default, so a scanned page is "
        "still readable; --no-ocr is faster.",
    ),
]
RecurseOpt = Annotated[
    bool, typer.Option("--recurse/--no-recurse", help="Descend into subfolders.")
]
NameOpt = Annotated[str, typer.Option("--name", help="Base filename for the reports.")]
PageImagesOpt = Annotated[
    bool,
    typer.Option(
        "--page-images/--no-page-images",
        help="Embed a picture of each page beside what was extracted from it. "
        "On by default; --no-page-images leaves the pictures out and makes the "
        "report considerably smaller.",
    ),
]
ExtractedTextOpt = Annotated[
    bool,
    typer.Option(
        "--extracted-text/--no-extracted-text",
        help="Include the text read off each page, so it can be read beside the "
        "page it came from. On by default; --no-extracted-text leaves the report "
        "carrying no document content.",
    ),
]
OcrCompareOpt = Annotated[
    bool,
    typer.Option(
        "--ocr-compare",
        help="Also OCR pages that already have a text layer, so the text layer and "
        "what OCR reads can be compared. Implies --extracted-text.",
    ),
]
ExtractorOpt = Annotated[
    str | None,
    typer.Option(
        "--extractor",
        help="Which library reads the text layer. Defaults to pdfplumber, the "
        "richest; pdfium is far quicker and reads no table structure. "
        "See: complydoc extractors.",
    ),
]
CompareExtractorsOpt = Annotated[
    list[str] | None,
    typer.Option(
        "--compare-extractor",
        help="Also read every page with this one and report where the two "
        "disagree, repeatable. It never changes a finding.",
    ),
]
CompareEnginesOpt = Annotated[
    list[str] | None,
    typer.Option(
        "--compare-ocr-engine",
        help="Also read every rasterised page with this engine and keep what it "
        "read, repeatable. It never changes a finding.",
    ),
]
OcrEngineOpt = Annotated[
    str | None,
    typer.Option("--ocr-engine", help="Which local OCR engine to read scans with."),
]
SaveTextOpt = Annotated[
    Path | None,
    typer.Option(
        "--save-text",
        help="Also write the text read off each document into this folder, one file "
        "per document. Reading a scanned folder is the slow part; this keeps the "
        "result so nothing has to OCR it again.",
    ),
]
PrintJsonOpt = Annotated[
    bool,
    typer.Option(
        "--print-json",
        help="Write the JSON report to stdout and nothing else, for piping into "
        "another tool or an agent. Progress goes to stderr.",
    ),
]
QuietOpt = Annotated[bool, typer.Option("--quiet", "-q", help="Suppress progress output.")]
JobsOpt = Annotated[
    int,
    typer.Option(
        "--jobs",
        "-j",
        help="Documents to process at once. The default reads the size of the "
        "folder and decides; 1 forces one process. Changes how long the run "
        "takes and nothing about what it finds.",
    ),
]
SampleOpt = Annotated[
    int | None,
    typer.Option(
        "--sample",
        help="Audit at most this many documents, keeping each file type's share of "
        "the folder. The report says it is a sample.",
    ),
]
PasswordOpt = Annotated[
    str,
    typer.Option(
        "--password",
        help="Password to try on encrypted PDFs. Passed on the command line, so it "
        "will be in your shell history.",
    ),
]
ModelOpt = Annotated[
    list[str] | None,
    typer.Option(
        "--model",
        "-m",
        help="Model id to price, repeatable. Defaults to every priced model. "
        "See: complydoc models.",
    ),
]


def _load(config_dir: Path | None) -> Config:
    try:
        return load_config(config_dir)
    except ConfigError as exc:
        errors.print(f"[bold red]Configuration error[/]\n{exc}")
        raise typer.Exit(code=2) from exc


def _emit(
    report: AuditReport,
    config: Config,
    out: Path,
    name: str,
    quiet: bool,
    save_text: Path | None = None,
    extractor: str | None = None,
    compare_extractors: list[str] | None = None,
    ocr_engine: str | None = None,
    compare_engines: list[str] | None = None,
) -> None:
    json_path = write_json(report, out / f"{name}.json").resolve()
    html_path = write_html(report, config, out / f"{name}.html").resolve()

    written: list[Path] = []
    if save_text is not None:
        from complydoc.report.text_writer import write_text

        written = write_text(report, save_text)

    if quiet:
        return
    # file:// URLs, so terminals that support hyperlinks open these on a click.
    console.print()
    console.print(
        f"[bold]Report[/]  [link=file://{html_path}]{html_path}[/link]", no_wrap=True, crop=False
    )
    console.print(
        f"[bold]Data[/]    [link=file://{json_path}]{json_path}[/link]", no_wrap=True, crop=False
    )
    if save_text is not None:
        folder = save_text.expanduser().resolve()
        console.print(
            f"[bold]Text[/]    [link=file://{folder}]{folder}[/link]  "
            f"[dim]{count(len(written), 'file')} — these are the documents, "
            f"identifiers and all[/]",
            no_wrap=True,
            crop=False,
        )


def _summary(report: AuditReport) -> None:
    aggregate = report.aggregate
    if aggregate is None:
        return

    table = Table(show_header=False, box=None, pad_edge=False)
    table.add_column(style="dim")
    table.add_column()
    table.add_row("Documents", f"{aggregate.documents_audited} ({aggregate.pages_total} pages)")
    if aggregate.documents_skipped:
        table.add_row("Skipped", f"[yellow]{aggregate.documents_skipped}[/]")
    if aggregate.total_text_path_usd is not None:
        table.add_row("Text path", f"${aggregate.total_text_path_usd:,.4f}")
    if aggregate.total_vision_path_usd is not None:
        table.add_row("Vision path", f"${aggregate.total_vision_path_usd:,.4f}")
    if aggregate.annual_text_usd is not None:
        table.add_row("Annual (text)", f"${aggregate.annual_text_usd:,.2f}")
    if aggregate.annual_vision_usd is not None:
        table.add_row("Annual (vision)", f"${aggregate.annual_vision_usd:,.2f}")
    if aggregate.mean_readiness_score is not None:
        table.add_row("AI readiness", f"{aggregate.mean_readiness_score}/100 (content)")
    if report.overall is not None and report.overall.score is not None:
        measured = len(report.overall.measured_factors)
        total = len(report.overall.factors)
        of = "" if measured == total else f", {measured} of {total} factors"
        table.add_row(
            "Global readiness",
            f"{report.overall.score}/100 {report.overall.label}{of}",
        )
    if "sensitive" in report.run.components_run:
        table.add_row(
            "Sensitive items",
            f"{aggregate.sensitive_total} in "
            f"{aggregate.documents_with_sensitive_data}/{aggregate.documents_audited} docs",
        )
        passages = aggregate.content_findings_total
        high = aggregate.content_findings_high
        summary = count(passages, "passage") if passages else "none found"
        table.add_row("Hidden content", f"[red]{summary}, {high} high[/]" if high else summary)
    if aggregate.pages_unreadable:
        table.add_row("Unread pages", f"[yellow]{aggregate.pages_unreadable}[/]")
    console.print(table)

    important = [x for x in report.limitations if x.severity == "important"]
    if important:
        console.print(
            f"\n[yellow]{count(len(important), 'important limitation')}[/] — see the report before "
            f"drawing conclusions."
        )
    for warning in report.staleness_warnings:
        console.print(f"[yellow]Price provenance:[/] {warning}")


@contextlib.contextmanager
def _watching(quiet: bool) -> Iterator[Callable[[int, int, Path], None] | None]:
    """A live count, a bar and a clock while the folder is read.

    Shows a bar, a count and elapsed time while documents are read.

    Nothing is drawn when the run was asked to be quiet, and a line per
    document is printed instead of a bar when the output is not a terminal —
    a redrawing bar in a log file is thousands of lines of escape codes.
    """
    if quiet:
        yield None
        return

    if not console.is_terminal:

        def plain(index: int, total: int, path: Path) -> None:
            console.print(f"[dim]({index}/{total})[/] {path.name}")

        yield plain
        return

    bar = Progress(
        SpinnerColumn(style="dim"),
        # A fixed width, so the bar does not jump sideways on every filename.
        TextColumn("{task.fields[name]}", table_column=Column(width=28, no_wrap=True)),
        BarColumn(bar_width=24, complete_style="green", finished_style="green"),
        MofNCompleteColumn(),
        TextColumn("[dim]·[/]"),
        TimeElapsedColumn(),
        TextColumn("[dim]elapsed,[/]"),
        TimeRemainingColumn(),
        TextColumn("[dim]left[/]"),
        console=console,
        transient=True,
    )
    with bar:
        # The total is unknown until the folder has been walked, which on a
        # large tree takes a while, so an indeterminate bar is shown meanwhile.
        task = bar.add_task("", total=None, name="finding documents")

        def report(index: int, total: int, path: Path) -> None:
            bar.update(task, completed=index, total=total, name=path.name)

        yield report


def _run(
    target: Path,
    components: tuple[str, ...],
    out: Path,
    name: str,
    config_dir: Path | None,
    ocr: bool,
    recurse: bool,
    quiet: bool,
    reveal: bool = False,
    monthly_volume: int | None = None,
    resolution: str = "medium",
    select_models: list[str] | None = None,
    page_images: bool = True,
    extracted_text: bool = True,
    ocr_compare: bool = False,
    print_json: bool = False,
    password: str = "",
    jobs: int = 0,
    sample: int | None = None,
    save_text: Path | None = None,
    extractor: str | None = None,
    compare_extractors: list[str] | None = None,
    ocr_engine: str | None = None,
    compare_engines: list[str] | None = None,
) -> None:
    offline.arm()
    if ocr_engine:
        from complydoc.ingest import ocr as ocr_module

        ocr_module.select(ocr_engine)
    # stdout has to stay pure JSON when a caller is parsing it.
    global console
    if print_json:
        console = errors
        quiet = True
    config = _load(config_dir)

    if not target.exists():
        errors.print(f"[bold red]No such path:[/] {target}")
        raise typer.Exit(code=2)

    if reveal:
        errors.print(
            "[bold yellow]--reveal is set.[/] The reports will contain unmasked sensitive "
            "values. Treat them as sensitive documents in their own right."
        )

    try:
        with _watching(quiet) as progress:
            report = run_audit(
                target,
                config,
                components,
                ocr=ocr,
                reveal=reveal,
                monthly_volume=monthly_volume,
                resolution=resolution,
                select_models=select_models,
                page_images=page_images,
                extracted_text=extracted_text or ocr_compare,
                ocr_compare=ocr_compare,
                recurse=recurse,
                password=password,
                extractor=extractor,
                compare_extractors=tuple(compare_extractors or ()),
                compare_engines=tuple(compare_engines or ()),
                jobs=jobs,
                sample=sample,
                progress=progress,
            )
    except UnknownModelError as exc:
        errors.print(f"[bold red]Unknown model[/] — {exc}\n\nRun 'complydoc models' to list them.")
        raise typer.Exit(code=2) from exc
    if not quiet:
        _summary(report)
    _emit(report, config, out, name, quiet, save_text)
    if print_json:
        import json as _json

        from complydoc.report.json_writer import to_dict

        sys.stdout.write(
            _json.dumps(to_dict(report), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
        )


@app.command()
def audit(
    target: TargetArg,
    out: OutDirOpt = DEFAULT_OUT,
    name: NameOpt = "complydoc",
    monthly_volume: Annotated[
        int | None,
        typer.Option("--monthly-volume", help="Documents per month, to extrapolate cost."),
    ] = None,
    resolution: Annotated[
        str, typer.Option("--vision-resolution", help="Headline vision resolution preset.")
    ] = "medium",
    reveal: Annotated[
        bool,
        typer.Option(
            "--reveal",
            help="Print sensitive values in full. Off by default, and the report says so.",
        ),
    ] = False,
    model: ModelOpt = None,
    page_images: PageImagesOpt = True,
    extracted_text: ExtractedTextOpt = True,
    ocr_compare: OcrCompareOpt = False,
    password: PasswordOpt = "",
    jobs: JobsOpt = 0,
    sample: SampleOpt = None,
    config_dir: ConfigOpt = None,
    ocr: OcrOpt = True,
    recurse: RecurseOpt = True,
    extractor: ExtractorOpt = None,
    ocr_engine: OcrEngineOpt = None,
    compare_ocr_engine: CompareEnginesOpt = None,
    compare_extractor: CompareExtractorsOpt = None,
    save_text: SaveTextOpt = None,
    print_json: PrintJsonOpt = False,
    quiet: QuietOpt = False,
) -> None:
    """Run all three components and write both reports."""
    _run(
        target,
        COMPONENTS,
        out,
        name,
        config_dir,
        ocr,
        recurse,
        quiet,
        reveal=reveal,
        monthly_volume=monthly_volume,
        resolution=resolution,
        select_models=model,
        page_images=page_images,
        extracted_text=extracted_text,
        ocr_compare=ocr_compare,
        print_json=print_json,
        save_text=save_text,
        extractor=extractor,
        compare_extractors=compare_extractor,
        ocr_engine=ocr_engine,
        compare_engines=compare_ocr_engine,
        password=password,
        jobs=jobs,
        sample=sample,
    )


@app.command()
def demo(
    out: OutDirOpt = DEFAULT_OUT,
    ocr: OcrOpt = True,
    open_report: Annotated[
        bool,
        typer.Option("--open/--no-open", help="Open the report when it is written."),
    ] = True,
) -> None:
    """Audit seven sample documents, so you can see a report without finding a folder.

    The samples ship with the tool and are synthetic: every identifier in them
    was invented. Between them they carry a scan with no text layer, a
    two-column page the readers disagree about, a whitespace table, and
    identifiers of several kinds — the problems this exists to find.
    """
    folder = _sample_folder()
    if folder is None:
        errors.print("[bold red]The sample documents are missing from this install.[/]")
        raise typer.Exit(code=2)

    console.print(
        "[dim]Auditing the seven sample documents that ship with complydoc. "
        "They are synthetic — no real person is described in them.[/]"
    )
    _run(
        folder,
        COMPONENTS,
        out,
        "complydoc-demo",
        None,
        ocr,
        True,
        False,
        page_images=True,
        extracted_text=True,
        # The comparison is most of what makes the sample worth looking at:
        # one of these documents is read differently by different libraries.
        compare_extractors=["pypdf"],
    )
    if open_report:
        _open((out / "complydoc-demo.html").resolve())


def _sample_folder() -> Path | None:
    """Where the shipped sample documents are, or None if they are not there.

    `importlib.resources.as_file` only learned to hand back a directory in
    3.12, and this supports 3.11. Resolving the package directory works on
    every version for a normal install, where the wheel is unpacked.
    """
    from importlib.resources import files

    try:
        folder = Path(str(files("complydoc"))) / "sample"
    except (TypeError, ModuleNotFoundError):  # pragma: no cover - a zipimported install
        return None
    documents = [p for p in folder.iterdir() if p.is_file()] if folder.is_dir() else []
    return folder if documents else None


def _open(path: Path) -> None:
    """Show the report, without making a failure to do so a failed run."""
    import subprocess
    import sys

    openers = {"darwin": ["open"], "win32": ["cmd", "/c", "start", ""]}
    opener = openers.get(sys.platform, ["xdg-open"])
    try:
        subprocess.run([*opener, str(path)], check=False, capture_output=True, timeout=10)
    except Exception:
        console.print(f"[dim]Open it yourself: {path}[/]")


@app.command()
def compare(
    target: TargetArg,
    out: OutDirOpt = DEFAULT_OUT,
    name: NameOpt = "complydoc-compare",
    extractor: ExtractorOpt = None,
    ocr_engine: OcrEngineOpt = None,
    password: PasswordOpt = "",
    jobs: JobsOpt = 0,
    sample: SampleOpt = None,
    config_dir: ConfigOpt = None,
    ocr: OcrOpt = True,
    recurse: RecurseOpt = True,
    save_text: SaveTextOpt = None,
    print_json: PrintJsonOpt = False,
    quiet: QuietOpt = False,
) -> None:
    """Read every page with every reader and every OCR engine installed.

    The same audit, with each library's reading of each page kept beside the
    others. Only the first still reaches a finding; the rest are there to be
    compared against it, and the report marks the pages where they parted
    company.
    """
    from complydoc.ingest.engines.registry import DEFAULT_ENGINE, all_engines
    from complydoc.ingest.extractors.registry import DEFAULT_EXTRACTOR, all_extractors

    kept_reader = extractor or DEFAULT_EXTRACTOR
    kept_engine = ocr_engine or DEFAULT_ENGINE
    readers = [e.id for e in all_extractors() if e.available() and e.id != kept_reader]
    # Comparing OCR engines means running OCR. With --no-ocr there is nothing
    # for them to read.
    engines = [e.id for e in all_engines() if ocr and e.available() and e.id != kept_engine]

    if not quiet and not print_json:
        console.print(
            f"Reading with [bold]{kept_reader}[/][dim], comparing against [/]"
            f"[bold]{'[/], [bold]'.join(readers) if readers else 'nothing else installed'}[/]"
        )
        if ocr:
            console.print(
                f"OCR with [bold]{kept_engine}[/][dim], comparing against [/]"
                f"[bold]{'[/], [bold]'.join(engines) if engines else 'nothing else installed'}[/]"
            )
        else:
            console.print("[dim]OCR is off, so no scan is read and no engine is compared.[/]")
        if not readers and not engines:
            console.print(
                "[yellow]Nothing to compare against.[/] Run "
                "[bold]complydoc extractors[/] and [bold]complydoc engines[/] to see "
                "what is installed."
            )
        # Every page read several times over, and every scan recognised twice.
        console.print("[dim]This reads each page several times, so it is slower than audit.[/]")

    _run(
        target,
        COMPONENTS,
        out,
        name,
        config_dir,
        ocr,
        recurse,
        quiet,
        page_images=True,
        extracted_text=True,
        # Text against the OCR of the same page is a comparison too, and the
        # one that most often disagrees.
        ocr_compare=ocr,
        print_json=print_json,
        save_text=save_text,
        extractor=extractor,
        compare_extractors=readers,
        ocr_engine=ocr_engine,
        compare_engines=engines,
        password=password,
        jobs=jobs,
        sample=sample,
    )


@app.command()
def cost(
    target: TargetArg,
    out: OutDirOpt = DEFAULT_OUT,
    name: NameOpt = "complydoc-cost",
    monthly_volume: Annotated[
        int | None,
        typer.Option("--monthly-volume", help="Documents per month, to extrapolate cost."),
    ] = None,
    resolution: Annotated[
        str, typer.Option("--vision-resolution", help="Headline vision resolution preset.")
    ] = "medium",
    model: ModelOpt = None,
    password: PasswordOpt = "",
    jobs: JobsOpt = 0,
    sample: SampleOpt = None,
    config_dir: ConfigOpt = None,
    ocr: OcrOpt = True,
    recurse: RecurseOpt = True,
    extractor: ExtractorOpt = None,
    ocr_engine: OcrEngineOpt = None,
    compare_ocr_engine: CompareEnginesOpt = None,
    compare_extractor: CompareExtractorsOpt = None,
    save_text: SaveTextOpt = None,
    print_json: PrintJsonOpt = False,
    quiet: QuietOpt = False,
) -> None:
    """Estimate LLM processing cost only."""
    _run(
        target,
        ("cost",),
        out,
        name,
        config_dir,
        ocr,
        recurse,
        quiet,
        monthly_volume=monthly_volume,
        resolution=resolution,
        select_models=model,
        print_json=print_json,
        save_text=save_text,
        extractor=extractor,
        compare_extractors=compare_extractor,
        ocr_engine=ocr_engine,
        compare_engines=compare_ocr_engine,
        password=password,
        jobs=jobs,
        sample=sample,
    )


@app.command()
def readiness(
    target: TargetArg,
    out: OutDirOpt = DEFAULT_OUT,
    name: NameOpt = "complydoc-readiness",
    extracted_text: ExtractedTextOpt = True,
    ocr_compare: OcrCompareOpt = False,
    password: PasswordOpt = "",
    jobs: JobsOpt = 0,
    sample: SampleOpt = None,
    config_dir: ConfigOpt = None,
    ocr: OcrOpt = True,
    recurse: RecurseOpt = True,
    extractor: ExtractorOpt = None,
    ocr_engine: OcrEngineOpt = None,
    compare_ocr_engine: CompareEnginesOpt = None,
    compare_extractor: CompareExtractorsOpt = None,
    save_text: SaveTextOpt = None,
    print_json: PrintJsonOpt = False,
    quiet: QuietOpt = False,
) -> None:
    """Measure extraction readiness signals only."""
    _run(
        target,
        ("readiness",),
        out,
        name,
        config_dir,
        ocr,
        recurse,
        quiet,
        extracted_text=extracted_text,
        ocr_compare=ocr_compare,
        print_json=print_json,
        save_text=save_text,
        extractor=extractor,
        compare_extractors=compare_extractor,
        ocr_engine=ocr_engine,
        compare_engines=compare_ocr_engine,
        password=password,
        jobs=jobs,
        sample=sample,
    )


@app.command()
def sensitive(
    target: TargetArg,
    out: OutDirOpt = DEFAULT_OUT,
    name: NameOpt = "complydoc-sensitive",
    reveal: Annotated[
        bool,
        typer.Option(
            "--reveal",
            help="Print sensitive values in full. Off by default, and the report says so.",
        ),
    ] = False,
    page_images: PageImagesOpt = True,
    extracted_text: ExtractedTextOpt = True,
    password: PasswordOpt = "",
    jobs: JobsOpt = 0,
    sample: SampleOpt = None,
    config_dir: ConfigOpt = None,
    ocr: OcrOpt = True,
    recurse: RecurseOpt = True,
    extractor: ExtractorOpt = None,
    ocr_engine: OcrEngineOpt = None,
    compare_ocr_engine: CompareEnginesOpt = None,
    compare_extractor: CompareExtractorsOpt = None,
    save_text: SaveTextOpt = None,
    print_json: PrintJsonOpt = False,
    quiet: QuietOpt = False,
) -> None:
    """Scan for personal and financial identifiers only."""
    _run(
        target,
        ("sensitive",),
        out,
        name,
        config_dir,
        ocr,
        recurse,
        quiet,
        reveal=reveal,
        page_images=page_images,
        extracted_text=extracted_text,
        print_json=print_json,
        save_text=save_text,
        extractor=extractor,
        compare_extractors=compare_extractor,
        ocr_engine=ocr_engine,
        compare_engines=compare_ocr_engine,
        password=password,
        jobs=jobs,
        sample=sample,
    )


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

    config = _load(config_dir)
    console.print(f"[bold]complydoc {__version__}[/] · Python {sys.version.split()[0]}")
    console.print(f"Network guard: [green]{offline.guard_status()}[/]")
    console.print(f"Config: {config.source_dir} (digest {config.digest})")
    console.print(f"Formats: {', '.join(supported_extensions())}")
    console.print(f"Tokenizer vocabularies vendored: {len(available_encodings())}")

    if ocr_module.available():
        console.print(f"OCR: [green]available[/] ({ocr_module.engine_name()})")
    else:
        console.print(f"OCR: [yellow]unavailable[/] — {ocr_module.unavailable_reason()}")

    from complydoc.sensitive.detectors.ner import configured_models, model_available

    for name in configured_models(config.sensitive):
        ok, reason = model_available(name)
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

    config = _load(config_dir)
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
            f"{entry.input_per_mtok_usd:g}" if entry.is_priced else "\u2014",
            f"{entry.batch_input_per_mtok_usd:g}" if entry.has_batch_price else "\u2014",
            "yes" if entry.supports_vision else "[dim]text only[/]",
            (released_on(entry.id) or "\u2014").__str__(),
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


def _print_report_json(report: AuditReport) -> None:
    import json as _json

    from complydoc.report.json_writer import to_dict

    sys.stdout.write(
        _json.dumps(to_dict(report), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )


def _link(label: str, path: Path) -> None:
    path = path.resolve()
    console.print(
        f"[bold]{label:<7}[/] [link=file://{path}]{path}[/link]", no_wrap=True, crop=False
    )


@app.command("compare-loaders")
def compare_loaders_command(
    spec: Annotated[
        Path,
        typer.Argument(
            help="A YAML file naming the loaders, the documents and the expected facts."
        ),
    ],
    out: OutDirOpt = DEFAULT_OUT,
    name: NameOpt = "complydoc-loaders",
    config_dir: ConfigOpt = None,
    print_json: PrintJsonOpt = False,
    quiet: QuietOpt = False,
) -> None:
    """Run several document loaders on the same documents and report their differences.

    The file names each loader as `module:attribute` or a parser preset, the
    documents, and optionally the facts each loader's text should contain. The
    first loader is the baseline. Loaders run with network access blocked unless
    the file sets `allow_network: true`. See the Comparing loaders guide for the
    format.
    """
    from complydoc.loaders.spec_file import compare_from_file, read_comparison_file

    global console
    if print_json:
        console = errors
        quiet = True
    config = _load(config_dir)
    try:
        comparison = read_comparison_file(spec)
    except ConfigError as exc:
        errors.print(f"[bold red]Comparison file error[/]\n{exc}")
        raise typer.Exit(code=2) from exc
    if comparison.allow_network:
        errors.print(
            "[bold yellow]allow_network is set.[/] The loaders may send document content "
            "over the network. complydoc's own processing still runs with it blocked."
        )
    try:
        report = compare_from_file(spec, config=config)
    except (ImportError, ValueError, FileNotFoundError) as exc:
        errors.print(f"[bold red]Comparison failed[/] — {exc}")
        raise typer.Exit(code=2) from exc

    if not quiet and report.loader_comparison is not None:
        table = Table(box=None, pad_edge=False)
        for column in ("Loader", "Documents", "Pages", "Failed files", "Network attempts"):
            table.add_column(column, justify="left" if column == "Loader" else "right")
        with_facts = bool(comparison.facts)
        if with_facts:
            table.add_column("Facts found", justify="right")
        for row in report.loader_comparison.loaders:
            cells = [
                row.name,
                str(row.documents),
                str(row.pages),
                str(len(row.failures)),
                str(len(row.network_attempts)),
            ]
            if with_facts:
                cells.append(f"{row.facts_found or 0} of {len(comparison.facts)}")
            table.add_row(*cells)
        console.print(table)
    _emit(report, config, out, name, quiet)
    if print_json:
        _print_report_json(report)


def _splitter(reference: str) -> tuple[str, object]:
    """A splitter from `module:attribute key=value ...`, and the name to show it by."""
    import functools
    import inspect
    import shlex

    import yaml

    from complydoc.utils.imports import load_object

    target, *pairs = shlex.split(reference)
    options: dict[str, object] = {}
    for pair in pairs:
        key, separator, value = pair.partition("=")
        if not separator or not key:
            raise ValueError(f"expected key=value after the splitter, got {pair!r}")
        options[key] = yaml.safe_load(value)
    splitter = load_object(target)
    if inspect.isclass(splitter):
        splitter = splitter(**options)
    elif options:
        splitter = functools.partial(splitter, **options)
    label = " ".join([target.partition(":")[2], *pairs])
    return label, splitter


@app.command()
def chunks(
    target: TargetArg,
    splitter: Annotated[
        list[str],
        typer.Option(
            "--splitter",
            "-s",
            help="A text splitter as module:attribute, followed by key=value arguments, "
            "e.g. 'langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=800'. "
            "A class is created with the arguments; a function is called with the "
            "documents. Repeat to compare several.",
        ),
    ],
    fact: Annotated[
        list[str] | None,
        typer.Option("--fact", help="Text a chunk should contain whole, repeatable."),
    ] = None,
    model: Annotated[
        str | None, typer.Option("--model", "-m", help="Model whose tokenizer counts tokens.")
    ] = None,
    min_tokens: Annotated[
        int, typer.Option("--min-tokens", help="Flag chunks with fewer tokens as tiny.")
    ] = 20,
    max_tokens: Annotated[
        int | None, typer.Option("--max-tokens", help="Flag chunks with more tokens as oversized.")
    ] = None,
    out: OutDirOpt = DEFAULT_OUT,
    name: NameOpt = "complydoc-chunks",
    extractor: ExtractorOpt = None,
    password: PasswordOpt = "",
    config_dir: ConfigOpt = None,
    ocr: OcrOpt = True,
    recurse: RecurseOpt = True,
    quiet: QuietOpt = False,
) -> None:
    """Split a folder's text with one or more splitters and inspect the chunks.

    Each page's text is read as `extract_text` reads it and passed to the splitter
    as documents with `source` and `page` metadata. Every chunk is scanned for
    identifiers and hidden passages and flagged when it is tiny, oversized, cut
    mid-sentence or mid-table, ends on a heading or repeats another chunk. The
    reports hold masked previews only.
    """
    from complydoc.extraction.chunks import inspect_chunks
    from complydoc.extraction.extract import extract_text
    from complydoc.report.pages import write_chunks_html, write_chunks_json

    offline.arm()
    config = _load(config_dir)
    try:
        splitters = dict(_splitter(reference) for reference in splitter)
    except (ImportError, ValueError) as exc:
        errors.print(f"[bold red]Cannot load the splitter[/] — {exc}")
        raise typer.Exit(code=2) from exc
    if len(splitters) != len(splitter):
        errors.print("[bold red]The same splitter is given twice.[/]")
        raise typer.Exit(code=2)

    try:
        text = extract_text(
            target,
            config=config,
            mask=False,
            ocr=ocr,
            recurse=recurse,
            password=password,
            extractor=extractor,
            model=model,
        )
    except FileNotFoundError as exc:
        errors.print(f"[bold red]No such path:[/] {target}")
        raise typer.Exit(code=2) from exc
    if not text.chunks:
        reasons = sorted({f"{w.document}: {w.detail}" for w in text.warnings if w.document})
        errors.print(f"[bold red]No text was read from[/] {target}")
        for reason in reasons[:10]:
            errors.print(f"  {reason}", markup=False)
        raise typer.Exit(code=2)
    documents = [
        {"page_content": c.text, "metadata": {"source": c.document, "page": c.page}}
        for c in text.chunks
    ]
    if not quiet and not text.complete:
        console.print(
            f"[yellow]{count(sum(w.hides_content for w in text.warnings), 'file or page')} "
            f"could not be read[/] and are not in the chunks."
        )

    from complydoc.extraction.chunks import ChunkComparison, ChunkReport

    def inspect(splitter_object: object, label: str) -> ChunkReport:
        return inspect_chunks(
            splitter_object,
            documents,
            name=label,
            config=config,
            model=model,
            min_tokens=min_tokens,
            max_tokens=max_tokens,
            facts=fact,
        )

    result: ChunkReport | ChunkComparison
    try:
        if len(splitters) == 1:
            [(label, only)] = splitters.items()
            result = inspect(only, label)
        else:
            result = ChunkComparison(
                {label: inspect(obj, label) for label, obj in splitters.items()}
            )
    except UnknownModelError as exc:
        errors.print(f"[bold red]Unknown model[/] — {exc}")
        raise typer.Exit(code=2) from exc
    reports = list(result.reports.values()) if isinstance(result, ChunkComparison) else [result]

    json_path = write_chunks_json(result, out / f"{name}.json")
    html_path = write_chunks_html(result, out / f"{name}.html", source=str(target))
    if quiet:
        return
    table = Table(box=None, pad_edge=False)
    for column in ("Splitter", "Chunks", "Median tokens", "Max tokens", "Flagged"):
        table.add_column(column, justify="left" if column == "Splitter" else "right")
    if fact:
        table.add_column("Facts whole", justify="right")
    for report in reports:
        cells = [
            report.chunker,
            str(report.stats.count),
            f"{report.stats.tokens_median:g}",
            str(report.stats.tokens_max),
            str(sum(1 for c in report.chunks if c.flags)),
        ]
        if fact:
            whole = sum(1 for f in report.facts if f.status == "whole")
            cells.append(f"{whole} of {len(report.facts)}")
        table.add_row(*cells)
    console.print(table)
    console.print()
    _link("Report", html_path)
    _link("Data", json_path)


@app.command()
def diff(
    old: Annotated[Path, typer.Argument(help="The earlier report JSON, such as a baseline.")],
    new: Annotated[Path, typer.Argument(help="The later report JSON.")],
    tolerance: Annotated[
        float,
        typer.Option("--tolerance", help="Ignore score changes smaller than this many points."),
    ] = 0.5,
    fail_on_regression: Annotated[
        bool,
        typer.Option(
            "--fail-on-regression/--no-fail-on-regression",
            help="Exit with status 1 when anything got worse. On by default, for CI.",
        ),
    ] = True,
    out: Annotated[
        Path | None,
        typer.Option("--out", "-o", help="Also write the changes as JSON and HTML here."),
    ] = None,
    name: NameOpt = "complydoc-diff",
    print_json: PrintJsonOpt = False,
    quiet: QuietOpt = False,
) -> None:
    """Compare two report JSON files and list what got worse and what got better.

    Documents are matched by relative path. A regression is an identifier,
    metadata finding or hidden passage that appeared, a score or text similarity
    that fell, a fact a loader no longer finds, a new network attempt or failed
    file, or a new important limitation. Exits 1 when there is a regression, 2
    when a file cannot be read.
    """
    from rich.markup import escape

    from complydoc.report.compare import diff_reports
    from complydoc.report.json_reader import load_report
    from complydoc.report.pages import diff_to_dict, write_diff_html, write_diff_json

    global console
    if print_json:
        console = errors
        quiet = True
    reports = []
    for path in (old, new):
        try:
            reports.append(load_report(path))
        except (OSError, ValueError, KeyError, TypeError) as exc:
            errors.print(f"[bold red]Cannot read the report[/] {path} — {exc}")
            raise typer.Exit(code=2) from exc
    changes = diff_reports(reports[0], reports[1], score_tolerance=tolerance)

    if not quiet:
        for change in changes.changes:
            where = f"{change.document}: " if change.document else ""
            values = f" ({change.before} → {change.after})" if change.kind == "changed" else ""
            mark = "[red]worse [/]" if change.worse else "[green]better[/]"
            console.print(
                f"{mark} {change.area} {change.kind}: {escape(where + change.subject + values)}",
                crop=False,
            )
        regressions = len(changes.regressions)
        console.print(
            f"\n[bold]{count(regressions, 'regression')}[/], "
            f"{count(len(changes.improvements), 'improvement')}"
            if changes
            else "No changes."
        )
    if out is not None:
        html_path = write_diff_html(changes, out / f"{name}.html", old=old.name, new=new.name)
        json_path = write_diff_json(changes, out / f"{name}.json")
        if not quiet:
            console.print()
            _link("Report", html_path)
            _link("Data", json_path)
    if print_json:
        import json as _json

        sys.stdout.write(_json.dumps(diff_to_dict(changes), indent=2, default=str) + "\n")
    if fail_on_regression and changes.regressions:
        raise typer.Exit(code=1)


if __name__ == "__main__":  # pragma: no cover
    app()
