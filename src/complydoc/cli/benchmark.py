"""`benchmark`: score identifier detection against the labelled corpus."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Annotated

import typer
from rich.table import Table

from complydoc import offline
from complydoc.cli.common import (
    ConfigOpt,
    app,
    console,
    load_config_or_exit,
)
from complydoc.utils.files import write_text

if TYPE_CHECKING:  # pragma: no cover - type-checking imports only
    from typing import Any

    from complydoc.benchmark import BenchmarkResult, CategoryScore


def _headline(result: BenchmarkResult) -> Table:
    """What detection found across the corpus, and what it should not have."""
    table = Table(show_header=False, box=None, pad_edge=False)
    table.add_column(style="dim")
    table.add_column()
    table.add_row("Passages", f"{result.passages}")
    table.add_row("Labelled identifiers", f"{result.labelled_total}")
    table.add_row("Found", f"{result.found_total}")
    table.add_row("Missed", f"[yellow]{result.missed_total}[/]" if result.missed_total else "0")
    flagged = result.wrongly_flagged_total
    table.add_row("Wrongly flagged", f"[yellow]{flagged}[/]" if flagged else "0")
    table.add_row("Recall", f"{result.recall_pct}%")
    table.add_row("Precision", f"{result.precision_pct}%")
    table.add_row(
        "Passages holding nothing",
        f"{result.clean_passages}, {result.clean_passages_with_a_flag} with a flag",
    )
    table.add_row(
        "Evidence", ", ".join(f"{tier} {n}" for tier, n in sorted(result.by_evidence.items()))
    )
    return table


def _names(result: BenchmarkResult) -> Table:
    """Names, scored apart: the figure describes the model on this machine."""
    table = Table(show_header=False, box=None, pad_edge=False)
    table.add_column(style="dim")
    table.add_column()
    table.add_row("Names found by", f"{result.model_name}")
    table.add_row("Labelled names", f"{result.names_labelled}")
    table.add_row("Found", f"{result.names_found}")
    missed = result.names_labelled - result.names_found
    table.add_row("Missed", f"[yellow]{missed}[/]" if missed else "0")
    flagged = result.names_wrongly_flagged
    table.add_row("Wrongly flagged", f"[yellow]{flagged}[/]" if flagged else "0")
    table.add_row("Recall", f"{result.names_recall_pct}%")
    table.add_row("Precision", f"{result.names_precision_pct}%")
    return table


def _instructions(result: BenchmarkResult) -> Table:
    """Passages written at a model, and passages written to be mistaken for one."""
    table = Table(show_header=False, box=None, pad_edge=False)
    table.add_column(style="dim")
    table.add_column()
    table.add_row("Labelled injections", f"{len(result.instructions_injected)}")
    table.add_row("Found", f"{result.instructions_found}")
    missed = len(result.instructions_missed)
    table.add_row("Missed", f"[yellow]{missed}[/]" if missed else "0")
    wrong = len(result.instructions_wrongly_flagged)
    table.add_row("Wrongly flagged", f"[yellow]{wrong}[/]" if wrong else "0")
    table.add_row("Recall", f"{result.instruction_recall_pct}%")
    table.add_row("Precision", f"{result.instruction_precision_pct}%")
    table.add_row(
        "Scored by",
        "patterns and a registered classifier"
        if result.classifier_scores
        else "patterns only, no classifier registered",
    )
    return table


def _categories(imperfect: list[CategoryScore]) -> Table:
    """Only the categories worth looking at: the ones that got something wrong."""
    table = Table(
        title="Categories that missed something or flagged something", title_justify="left"
    )
    table.add_column("Category")
    table.add_column("Found", justify="right")
    table.add_column("Missed", justify="right")
    table.add_column("Wrongly flagged", justify="right")
    for score in imperfect:
        table.add_row(
            score.category,
            f"{score.found}/{score.labelled}",
            str(score.missed),
            str(score.wrongly_flagged),
        )
    return table


def _scores(result: BenchmarkResult) -> dict[str, Any]:
    """The same numbers as JSON, for a caller that wants to track them over time."""
    return {
        "passages": result.passages,
        "labelled": result.labelled_total,
        "found": result.found_total,
        "missed": result.missed_total,
        "wrongly_flagged": result.wrongly_flagged_total,
        "recall_pct": result.recall_pct,
        "precision_pct": result.precision_pct,
        "by_evidence": result.by_evidence,
        "clean_passages": result.clean_passages,
        "clean_passages_with_a_flag": result.clean_passages_with_a_flag,
        "names": {
            "measured": result.names_measured,
            "model": result.model_name,
            "labelled": result.names_labelled,
            "found": result.names_found,
            "wrongly_flagged": result.names_wrongly_flagged,
            "recall_pct": result.names_recall_pct,
            "precision_pct": result.names_precision_pct,
        },
        "instructions": {
            "labelled": result.instructions_labelled,
            "injections": len(result.instructions_injected),
            "found": result.instructions_found,
            "missed": result.instructions_missed,
            "wrongly_flagged": result.instructions_wrongly_flagged,
            "recall_pct": result.instruction_recall_pct,
            "precision_pct": result.instruction_precision_pct,
            "classifier_scores": result.classifier_scores,
        },
        "categories": {
            score.category: {
                "found": score.found,
                "missed": score.missed,
                "wrongly_flagged": score.wrongly_flagged,
                "unmeasured": score.unmeasured,
                "misses": score.misses,
                "false_flags": score.false_flags,
            }
            for score in sorted(result.categories.values(), key=lambda s: s.category)
        },
    }


@app.command(rich_help_panel="Information")
def benchmark(
    config_dir: ConfigOpt = None,
    json_out: Annotated[
        Path | None,
        typer.Option("--json", help="Write the scores as JSON to this path."),
    ] = None,
    verbose: Annotated[
        bool,
        typer.Option("--verbose", help="List every miss and every wrongly flagged value."),
    ] = False,
) -> None:
    """Measure what identifier detection finds and what it wrongly flags."""
    offline.arm()
    from complydoc.benchmark import run_benchmark

    config = load_config_or_exit(config_dir)
    result = run_benchmark(config)
    console.print(_headline(result))

    if result.names_measured:
        console.print()
        console.print(_names(result))
        console.print(
            "[dim]A name score describes the model installed on this machine, so it is kept "
            "out of the figures above.[/]"
        )

    if result.instructions_labelled:
        console.print()
        console.print(_instructions(result))
        if verbose:
            for name in result.instructions_missed:
                # Named apart from the `score` below: a missed injection the
                # classifier scored just under the threshold is the useful case,
                # and the number says so where a bare "missed" would not.
                scored = result.classifier_scores.get(name)
                suffix = f", classifier scored it {scored:.2f}" if scored is not None else ""
                console.print(f"  missed  injection {name}{suffix}", markup=False)
            for name in result.instructions_wrongly_flagged:
                console.print(f"  flagged not an injection: {name}", markup=False)

    imperfect = [
        score
        for score in sorted(result.measured, key=lambda s: s.category)
        if score.missed or score.wrongly_flagged
    ]
    if imperfect:
        console.print(_categories(imperfect))
        if verbose:
            for score in imperfect:
                for item in score.misses:
                    console.print(f"  missed  {score.category}: {item}", markup=False)
                for item in score.false_flags:
                    console.print(f"  flagged {score.category}: {item}", markup=False)

    unmeasured = [s.category for s in result.categories.values() if s.unmeasured]
    if unmeasured:
        console.print(
            f"[yellow]Not measured:[/] {', '.join(sorted(unmeasured))} — the detector "
            f"could not run, so nothing of that kind was scored."
        )

    if json_out is not None:
        write_text(json_out, json.dumps(_scores(result), indent=2) + "\n")
        console.print(f"Scores {json_out}")
