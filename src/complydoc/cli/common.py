"""What every command shares: the app, the consoles, option types and output helpers."""

from __future__ import annotations

import json
import sys
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.markup import escape

from complydoc.config.loader import ConfigError, load_config
from complydoc.config.schema import Config
from complydoc.report.html_writer import write_html
from complydoc.report.json_writer import Detail, to_dict, write_json
from complydoc.report.models import AuditReport
from complydoc.utils.text import count

__all__ = [
    "DEFAULT_OUT",
    "ClassifierOpt",
    "ClassifierThresholdOpt",
    "CompareEnginesOpt",
    "CompareExtractorsOpt",
    "ConfigOpt",
    "DetailOpt",
    "ExtractedTextOpt",
    "ExtractorOpt",
    "JobsOpt",
    "ModelOpt",
    "NameOpt",
    "OcrCompareOpt",
    "OcrEngineOpt",
    "OcrOpt",
    "OutDirOpt",
    "PageImagesOpt",
    "PasswordOpt",
    "PrintJsonOpt",
    "QuietOpt",
    "RecurseOpt",
    "ReportDetail",
    "SampleOpt",
    "SaveTextOpt",
    "TargetArg",
    "TimeoutOpt",
    "VerifyOpt",
    "VerifyScopeOpt",
    "app",
    "console",
    "emit",
    "errors",
    "link",
    "load_config_or_exit",
    "print_report_json",
    "route_output",
]

app = typer.Typer(
    add_completion=False,
    no_args_is_help=False,
    help=(
        "Check documents before they reach an LLM, offline: what they would cost to "
        "process, how reliably their text can be read, which personal and financial "
        "identifiers they hold, and whether anything hidden in them is addressed to a "
        "model. No document content leaves this machine unless you pass --classifier, "
        "which sends the passages it judges to the service you name."
    ),
)
console = Console()
"""Progress, summaries and links. Written to stderr while stdout carries JSON."""
errors = Console(stderr=True)


def route_output(print_json: bool) -> None:
    """Send `console` to stderr when stdout has to stay pure JSON, and back otherwise."""
    console.stderr = print_json


TargetArg = Annotated[Path, typer.Argument(help="A file or folder to audit.")]
OutDirOpt = Annotated[
    Path,
    typer.Option("--out", "-o", help="Directory for the reports."),
]
DEFAULT_OUT = Path(".complydoc")
"""Hidden, so a second run does not discover the first run's own reports."""
IgnoreFileOpt = Annotated[
    Path | None,
    typer.Option(
        "--ignore-file",
        help="Findings to set aside, each with a reason. Without it, "
        ".complydoc-ignore.yaml at the top of the folder is read when there is one.",
    ),
]
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
        "Off by default: a picture shows every value on the page, so a report "
        "built with it carries the identifiers the rest of the report masks.",
    ),
]


class ReportDetail(StrEnum):
    """How much the JSON report carries."""

    summary = "summary"
    full = "full"


DetailOpt = Annotated[
    ReportDetail,
    typer.Option(
        "--detail",
        help="How much the JSON report carries. `summary`, the default, keeps every "
        "finding and score and the folder's cost on each model, and leaves out the "
        "price of every document on every model and the page geometry the HTML draws "
        "with. `full` writes every field; use it for anything that reprocesses reports.",
    ),
]
ExtractedTextOpt = Annotated[
    bool,
    typer.Option(
        "--extracted-text/--no-extracted-text",
        help="Include the text read off each page, with its identifiers masked, so "
        "it can be read beside the page it came from. On by default; "
        "--no-extracted-text leaves the report carrying no document content.",
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
        "per document, with identifiers masked unless --reveal is set. Reading a "
        "scanned folder is the slow part; this keeps the result so nothing has to "
        "OCR it again.",
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
ClassifierOpt = Annotated[
    str | None,
    typer.Option(
        "--classifier",
        help="Score passages for hidden instructions with a classifier as well as the "
        "patterns. 'jev' is TypeSafe's hosted model and SENDS THE PASSAGES IT JUDGES "
        "to api.typesafe.ai; 'module:function' is code of your own. The report names "
        "where anything was sent. Nothing is registered by default.",
    ),
]
ClassifierThresholdOpt = Annotated[
    float | None,
    typer.Option(
        "--classifier-threshold",
        help="Score at or above which a passage is reported, 0 to 1. Defaults to the "
        "value in hidden.yaml, except for 'jev', which uses the 0.5 measured for it.",
    ),
]
VerifyOpt = Annotated[
    str | None,
    typer.Option(
        "--verify",
        help="Read pages again with a vision model of your own, 'vision:module:function', "
        "and report where it disagrees with the text kept. Your code makes the call with "
        "your key, and SENDS EACH PAGE IMAGE to wherever it calls; the report names the "
        "hosts. Nothing is verified by default.",
    ),
]
VerifyScopeOpt = Annotated[
    str,
    typer.Option(
        "--verify-scope",
        help="Which pages --verify reads: 'flagged' (routing sent them to vision, they had "
        "no usable reading, or two readers disagreed) or 'all' (every page).",
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
TimeoutOpt = Annotated[
    float,
    typer.Option(
        "--timeout",
        help="Seconds to give each document. A document still being read when the "
        "time passes is stopped and listed as skipped. 0 means no limit. Reading "
        "happens in a worker process when this is set, even with --jobs 1.",
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


def load_config_or_exit(config_dir: Path | None) -> Config:
    try:
        return load_config(config_dir)
    except ConfigError as exc:
        errors.print(f"[bold red]Configuration error[/]\n{escape(str(exc))}")
        raise typer.Exit(code=2) from exc


def link(label: str, path: Path) -> None:
    """A file:// link, so terminals that support hyperlinks open it on a click."""
    path = path.resolve()
    console.print(
        f"[bold]{label:<7}[/] [link=file://{path}]{path}[/link]", no_wrap=True, crop=False
    )


def emit(
    report: AuditReport,
    config: Config,
    out: Path,
    name: str,
    quiet: bool,
    save_text: Path | None = None,
    detail: Detail = "summary",
) -> None:
    """Write the JSON and HTML reports, and the extracted text when asked, then link them."""
    json_path = write_json(report, out / f"{name}.json", detail=detail).resolve()
    html_path = write_html(report, config, out / f"{name}.html").resolve()

    written: list[Path] = []
    if save_text is not None:
        from complydoc.report.text_writer import write_text

        written = write_text(report, save_text)

    if quiet:
        return
    console.print()
    console.print(
        f"[bold]Report[/]  [link=file://{html_path}]{html_path}[/link]", no_wrap=True, crop=False
    )
    console.print(
        f"[bold]Data[/]    [link=file://{json_path}]{json_path}[/link]", no_wrap=True, crop=False
    )
    viewer = "complydoc ui" if out.resolve() == DEFAULT_OUT.resolve() else f"complydoc ui {out}"
    console.print(f"[bold]View[/]    {escape(viewer)}", no_wrap=True, crop=False)
    if save_text is not None:
        folder = save_text.expanduser().resolve()
        held = (
            "these are the documents, identifiers and all"
            if report.run.reveal_used
            else "identifiers masked, as in the report"
        )
        console.print(
            f"[bold]Text[/]    [link=file://{folder}]{folder}[/link]  "
            f"[dim]{count(len(written), 'file')}, {held}[/]",
            no_wrap=True,
            crop=False,
        )


def print_report_json(report: AuditReport, detail: Detail = "summary") -> None:
    sys.stdout.write(
        json.dumps(to_dict(report, detail=detail), indent=2, sort_keys=True, ensure_ascii=False)
        + "\n"
    )
