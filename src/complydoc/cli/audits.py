"""Commands that audit files: `audit`, `demo`, `compare`, `cost`, `readiness`,
`sensitive`, and the bare `complydoc`, which audits the working directory."""

from __future__ import annotations

import contextlib
import subprocess
import sys
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Annotated

import typer
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

from complydoc import offline
from complydoc.audit.run import COMPONENTS, run_audit
from complydoc.cli.classifiers import ClassifierError, classifying
from complydoc.cli.common import (
    DEFAULT_OUT,
    ClassifierOpt,
    ClassifierThresholdOpt,
    CompareEnginesOpt,
    CompareExtractorsOpt,
    ConfigOpt,
    ExtractedTextOpt,
    ExtractorOpt,
    JobsOpt,
    ModelOpt,
    NameOpt,
    OcrCompareOpt,
    OcrEngineOpt,
    OcrOpt,
    OutDirOpt,
    PageImagesOpt,
    PasswordOpt,
    PrintJsonOpt,
    QuietOpt,
    RecurseOpt,
    SampleOpt,
    SaveTextOpt,
    TargetArg,
    TimeoutOpt,
    app,
    console,
    emit,
    errors,
    load_config_or_exit,
    print_report_json,
    route_output,
)
from complydoc.cost.estimator import UnknownModelError
from complydoc.report.models import AuditReport
from complydoc.utils.text import count

__all__ = ["run", "summary", "watching"]


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context) -> None:
    """Run `complydoc` on its own to audit the folder you are standing in.

    Anything more specific is a subcommand: `complydoc audit <path>`, `cost`,
    `readiness`, `sensitive`, `models`, `schema`, `doctor`.
    """
    # Every command starts writing to stdout; --print-json moves it to stderr.
    route_output(False)
    if ctx.invoked_subcommand is not None:
        return
    here = Path.cwd()
    console.print(f"[dim]Auditing[/] {here}")
    run(here, COMPONENTS, DEFAULT_OUT, "complydoc", None, True, True, False)


def unscanned_labels(report: AuditReport) -> list[str]:
    """Labels of the categories nothing was looked for, in a stable order."""
    labels: dict[str, str] = {}
    for document in report.documents:
        for entry in document.sensitive.unscanned_categories if document.sensitive else []:
            labels[entry.category] = entry.label
    return [labels[key] for key in sorted(labels)]


def summary(report: AuditReport) -> None:
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
        not_scanned = unscanned_labels(report)
        counted = (
            f"{aggregate.sensitive_total} in "
            f"{aggregate.documents_with_sensitive_data}/{aggregate.documents_audited} docs"
        )
        if not_scanned:
            plural = "category" if len(not_scanned) == 1 else "categories"
            counted += f", {len(not_scanned)} {plural} not scanned"
        table.add_row("Sensitive items", counted)
        if not_scanned:
            # A category nothing was looked for reads as a category with nothing
            # in it, so the count above is said to be incomplete where it is read.
            table.add_row(
                "Not scanned",
                f"[yellow]{', '.join(not_scanned)}[/] — nothing was looked for, so no "
                f"conclusion about these can be drawn",
            )
        passages = aggregate.content_findings_total
        high = aggregate.content_findings_high
        found = count(passages, "passage") if passages else "none found"
        table.add_row("Hidden content", f"[red]{found}, {high} high[/]" if high else found)
    if aggregate.pages_unreadable:
        table.add_row("Unread pages", f"[yellow]{aggregate.pages_unreadable}[/]")
    console.print(table)

    if report.run.content_sent_to:
        console.print(
            f"[bold yellow]Text from these documents was sent to "
            f"{', '.join(sorted(report.run.content_sent_to))}.[/] A registered classifier "
            f"read the passages it judged; nothing else left this machine."
        )
    if report.run.classifier_missed_workers:
        console.print(
            f"[yellow]A classifier was registered but did not run for "
            f"{report.run.classifier_missed_workers} documents[/] read in worker "
            f"processes. Use --jobs 1 to put every document in reach of it."
        )

    important = [x for x in report.limitations if x.severity == "important"]
    if important:
        console.print(
            f"\n[yellow]{count(len(important), 'important limitation')}[/] — see the report before "
            f"drawing conclusions."
        )
    for warning in report.staleness_warnings:
        console.print(f"[yellow]Price provenance:[/] {warning}")


@contextlib.contextmanager
def watching(quiet: bool) -> Iterator[Callable[[int, int, Path], None] | None]:
    """A live count, a bar and a clock while the folder is read.

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
        TextColumn("[dim]|[/]"),
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


def run(
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
    timeout: float | None = None,
    save_text: Path | None = None,
    extractor: str | None = None,
    compare_extractors: list[str] | None = None,
    ocr_engine: str | None = None,
    compare_engines: list[str] | None = None,
    classifier: str | None = None,
    classifier_threshold: float | None = None,
) -> None:
    """Audit `target` and write the reports: what every audit command does."""
    offline.arm()
    if ocr_engine:
        from complydoc.ingest import ocr as ocr_module

        ocr_module.select(ocr_engine)
    route_output(print_json)
    if print_json:
        quiet = True
    config = load_config_or_exit(config_dir)

    if not target.exists():
        errors.print(f"[bold red]No such path:[/] {target}")
        raise typer.Exit(code=2)

    if reveal:
        errors.print(
            "[bold yellow]--reveal is set.[/] The reports will contain unmasked sensitive "
            "values. Treat them as sensitive documents in their own right."
        )

    try:
        with classifying(classifier, classifier_threshold, jobs=jobs, config=config) as (
            config,
            jobs,
            notes,
        ):
            for note in notes:
                errors.print(note)
            with watching(quiet) as progress:
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
                    timeout=timeout,
                    progress=progress,
                )
    except ClassifierError as exc:
        errors.print(f"[bold red]Cannot use that classifier[/] — {exc}")
        raise typer.Exit(code=2) from exc
    except UnknownModelError as exc:
        errors.print(f"[bold red]Unknown model[/] — {exc}\n\nRun 'complydoc models' to list them.")
        raise typer.Exit(code=2) from exc
    if not quiet:
        summary(report)
    emit(report, config, out, name, quiet, save_text)
    if print_json:
        print_report_json(report)


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
    timeout: TimeoutOpt = 0.0,
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
    classifier: ClassifierOpt = None,
    classifier_threshold: ClassifierThresholdOpt = None,
) -> None:
    """Run all three components and write both reports."""
    run(
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
        timeout=timeout or None,
        classifier=classifier,
        classifier_threshold=classifier_threshold,
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
    """Audit the sample documents, so you can see a report without finding a folder.

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
        "[dim]Auditing the sample documents that ship with complydoc. "
        "They are synthetic — no real person is described in them.[/]"
    )
    run(
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
    openers = {"darwin": ["open"], "win32": ["cmd", "/c", "start", ""]}
    opener = openers.get(sys.platform, ["xdg-open"])
    try:
        subprocess.run([*opener, str(path)], check=False, capture_output=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
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
    timeout: TimeoutOpt = 0.0,
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

    run(
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
        timeout=timeout or None,
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
    timeout: TimeoutOpt = 0.0,
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
    run(
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
        timeout=timeout or None,
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
    timeout: TimeoutOpt = 0.0,
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
    run(
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
        timeout=timeout or None,
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
    timeout: TimeoutOpt = 0.0,
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
    classifier: ClassifierOpt = None,
    classifier_threshold: ClassifierThresholdOpt = None,
) -> None:
    """Scan for personal and financial identifiers only."""
    run(
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
        timeout=timeout or None,
        classifier=classifier,
        classifier_threshold=classifier_threshold,
    )
