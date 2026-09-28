"""`chunks`: split a folder's text with one or more splitters and inspect the chunks."""

from __future__ import annotations

import dataclasses
import datetime as dt
import functools
import inspect
import shlex
import time
from pathlib import Path
from typing import Annotated

import typer
import yaml
from rich.markup import escape
from rich.table import Table

from complydoc import offline
from complydoc.cli.common import (
    DEFAULT_OUT,
    ConfigOpt,
    ExtractorOpt,
    NameOpt,
    OcrOpt,
    OutDirOpt,
    PasswordOpt,
    QuietOpt,
    RecurseOpt,
    TargetArg,
    app,
    console,
    errors,
    load_config_or_exit,
    print_written,
)
from complydoc.cost.estimator import UnknownModelError
from complydoc.utils.imports import load_object
from complydoc.utils.text import count


@dataclasses.dataclass
class _Page:
    """A page of text with the attributes LangChain splitters read."""

    page_content: str
    metadata: dict[str, object]


def _splitter(reference: str) -> tuple[str, object]:
    """A splitter from `module:attribute key=value ...`, and the name to show it by."""
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


PRESETS: dict[str, tuple[str, ...]] = {
    "common": (
        "langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=500 chunk_overlap=50",
        "langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=1000 chunk_overlap=100",
        "langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=2000 chunk_overlap=200",
        "langchain_text_splitters:CharacterTextSplitter chunk_size=1000 chunk_overlap=100",
        # The encoding named, so it is the one complydoc ships rather than one fetched.
        "langchain_text_splitters:TokenTextSplitter chunk_size=256 chunk_overlap=32 "
        "encoding_name=o200k_base",
        "llama_index.core.node_parser:SentenceSplitter chunk_size=512 chunk_overlap=50",
    ),
}
"""Sets of splitters to compare in one run. A splitter whose library is not installed is
left out of a preset, and the run says so."""


@app.command(rich_help_panel="CI and pipelines")
def chunks(
    target: TargetArg,
    splitter: Annotated[
        list[str] | None,
        typer.Option(
            "--splitter",
            "-s",
            help="A text splitter as module:attribute, followed by key=value arguments, "
            "e.g. 'langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=800'. "
            "A class is created with the arguments; a function is called with the "
            "documents. Repeat to compare several.",
        ),
    ] = None,
    preset: Annotated[
        str | None,
        typer.Option(
            "--preset",
            help="A set of splitters to compare: 'common' runs recursive splitting at three "
            "sizes, character and token splitting, and LlamaIndex's sentence splitter.",
        ),
    ] = None,
    fact: Annotated[
        list[str] | None,
        typer.Option("--fact", help="Text a chunk should contain whole, repeatable."),
    ] = None,
    questions: Annotated[
        Path | None,
        typer.Option(
            "--questions",
            help="A YAML list of questions, each with `question`, `fact` and optionally "
            "`document`. Chunks are ranked for each question with BM25 keyword search.",
        ),
    ] = None,
    top_k: Annotated[
        int, typer.Option("--top-k", help="How many top-ranked chunks count as retrieved.")
    ] = 5,
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
    mid-sentence or mid-table, ends on a heading or repeats another chunk. With
    --questions, each question reports whether the chunk holding its answer ranks
    within --top-k. The reports hold masked previews only.
    """
    from complydoc.extraction.chunks import ChunkComparison, ChunkReport, inspect_chunks
    from complydoc.extraction.extract import extract_text
    from complydoc.extraction.retrieval import Question, read_questions
    from complydoc.report.chunk_run import chunk_run_report
    from complydoc.report.json_writer import write_json

    started_at = dt.datetime.now().astimezone()
    started = time.monotonic()
    offline.arm()
    config = load_config_or_exit(config_dir)
    if preset is not None and preset not in PRESETS:
        errors.print(f"[bold red]No preset {preset!r}.[/] Presets: {', '.join(PRESETS)}")
        raise typer.Exit(code=2)
    given = list(splitter or [])
    if not given and preset is None:
        errors.print("[bold red]No splitter given.[/] Pass --splitter, or --preset common.")
        raise typer.Exit(code=2)
    splitters: dict[str, object] = {}
    optional: set[str] = set()
    for reference in PRESETS[preset] if preset else ():
        try:
            label, made = _splitter(reference)
        except ImportError as exc:
            if not quiet:
                console.print(f"[dim]Left out of the preset, not installed: {escape(str(exc))}[/]")
            continue
        splitters[label] = made
        optional.add(label)
    try:
        for reference in given:
            label, made = _splitter(reference)
            if label in splitters:
                raise ValueError(f"the same splitter is given twice: {label}")
            splitters[label] = made
    except (ImportError, ValueError) as exc:
        errors.print(f"[bold red]Cannot load the splitter[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc
    question_list: list[Question] = []
    if questions is not None:
        try:
            question_list = read_questions(questions)
        except (OSError, ValueError, TypeError) as exc:
            errors.print(f"[bold red]Cannot read the questions[/] — {escape(str(exc))}")
            raise typer.Exit(code=2) from exc

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
    # page_number, not page: LangChain's `page` counts from 0, and these pages count from 1.
    documents = [_Page(c.text, {"source": c.document, "page_number": c.page}) for c in text.chunks]
    if not quiet and not text.complete:
        console.print(
            f"[yellow]{count(sum(w.hides_content for w in text.warnings), 'file or page')} "
            f"could not be read[/] and are not in the chunks."
        )

    def inspect_with(splitter_object: object, label: str) -> ChunkReport:
        return inspect_chunks(
            splitter_object,
            documents,
            name=label,
            config=config,
            model=model,
            min_tokens=min_tokens,
            max_tokens=max_tokens,
            facts=fact,
            questions=question_list,
            top_k=top_k,
        )

    def inspect_or_leave_out(label: str, splitter_object: object) -> ChunkReport | None:
        """A preset's splitter that fails on this machine is left out, and the run says so;
        one the caller named fails the run."""
        if label not in optional:
            return inspect_with(splitter_object, label)
        try:
            return inspect_with(splitter_object, label)
        except UnknownModelError:
            raise
        # The splitter is a library's; whatever it raises is its own.
        except Exception as exc:
            if not quiet:
                console.print(
                    f"[dim]Left out of the preset, it failed here: {label}: "
                    f"{escape(f'{type(exc).__name__}: {exc}'[:200])}[/]"
                )
            return None

    result: ChunkReport | ChunkComparison
    try:
        made = {label: inspect_or_leave_out(label, obj) for label, obj in splitters.items()}
        inspected = {label: report for label, report in made.items() if report is not None}
        if not inspected:
            errors.print("[bold red]No splitter could split the text.[/]")
            raise typer.Exit(code=2)
        if len(inspected) == 1:
            [result] = inspected.values()
        else:
            result = ChunkComparison(inspected)
    except UnknownModelError as exc:
        errors.print(f"[bold red]Unknown model[/] — {escape(str(exc))}")
        raise typer.Exit(code=2) from exc
    reports = list(result.reports.values()) if isinstance(result, ChunkComparison) else [result]

    # The data is a report like any other run's, so `complydoc ui` lists it with the
    # folder's audits; it holds the chunks and no per-document entries.
    run_report = chunk_run_report(
        reports,
        target,
        config,
        started_at=started_at,
        started=started,
        extractor=extractor,
        ocr_requested=ocr,
    )
    json_path = write_json(run_report, out / f"{name}.json")
    if quiet:
        return
    table = Table(box=None, pad_edge=False)
    for column in ("Splitter", "Chunks", "Median tokens", "Max tokens", "Flagged"):
        table.add_column(column, justify="left" if column == "Splitter" else "right")
    if fact:
        table.add_column("Facts whole", justify="right")
    if question_list:
        table.add_column(f"Retrieved in top {top_k}", justify="right")
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
        if question_list:
            retrieved = sum(1 for r in report.retrieval if r.status == "retrieved")
            cells.append(f"{retrieved} of {len(report.retrieval)}")
        table.add_row(*cells)
    console.print(table)
    console.print()
    print_written(json_path, out)
