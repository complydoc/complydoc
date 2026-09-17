"""`benchmark`: score identifier detection against the labelled corpus."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

import typer
from rich.table import Table

from complydoc import offline
from complydoc.cli.common import (
    ConfigOpt,
    app,
    console,
    load_config_or_exit,
)


@app.command()
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

    headline = Table(show_header=False, box=None, pad_edge=False)
    headline.add_column(style="dim")
    headline.add_column()
    headline.add_row("Passages", f"{result.passages}")
    headline.add_row("Labelled identifiers", f"{result.labelled_total}")
    headline.add_row("Found", f"{result.found_total}")
    headline.add_row("Missed", f"[yellow]{result.missed_total}[/]" if result.missed_total else "0")
    flagged = result.wrongly_flagged_total
    headline.add_row("Wrongly flagged", f"[yellow]{flagged}[/]" if flagged else "0")
    headline.add_row("Recall", f"{result.recall_pct}%")
    headline.add_row("Precision", f"{result.precision_pct}%")
    headline.add_row(
        "Passages holding nothing",
        f"{result.clean_passages}, {result.clean_passages_with_a_flag} with a flag",
    )
    tiers = ", ".join(f"{tier} {n}" for tier, n in sorted(result.by_evidence.items()))
    headline.add_row("Evidence", tiers)
    console.print(headline)

    if result.names_measured:
        names = Table(show_header=False, box=None, pad_edge=False)
        names.add_column(style="dim")
        names.add_column()
        names.add_row("Names found by", f"{result.model_name}")
        names.add_row("Labelled names", f"{result.names_labelled}")
        names.add_row("Found", f"{result.names_found}")
        missed_names = result.names_labelled - result.names_found
        names.add_row("Missed", f"[yellow]{missed_names}[/]" if missed_names else "0")
        flagged_names = result.names_wrongly_flagged
        names.add_row("Wrongly flagged", f"[yellow]{flagged_names}[/]" if flagged_names else "0")
        names.add_row("Recall", f"{result.names_recall_pct}%")
        names.add_row("Precision", f"{result.names_precision_pct}%")
        console.print()
        console.print(names)
        console.print(
            "[dim]A name score describes the model installed on this machine, so it is kept "
            "out of the figures above.[/]"
        )

    if result.instructions_labelled:
        hidden = Table(show_header=False, box=None, pad_edge=False)
        hidden.add_column(style="dim")
        hidden.add_column()
        hidden.add_row("Labelled injections", f"{len(result.instructions_injected)}")
        hidden.add_row("Found", f"{result.instructions_found}")
        missed = len(result.instructions_missed)
        hidden.add_row("Missed", f"[yellow]{missed}[/]" if missed else "0")
        wrong = len(result.instructions_wrongly_flagged)
        hidden.add_row("Wrongly flagged", f"[yellow]{wrong}[/]" if wrong else "0")
        hidden.add_row("Recall", f"{result.instruction_recall_pct}%")
        hidden.add_row("Precision", f"{result.instruction_precision_pct}%")
        if result.classifier_scores:
            hidden.add_row("Scored by", "patterns and a registered classifier")
        else:
            hidden.add_row("Scored by", "patterns only, no classifier registered")
        console.print()
        console.print(hidden)
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
        console.print(table)
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
        payload = {
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
        json_out.expanduser().parent.mkdir(parents=True, exist_ok=True)
        json_out.expanduser().write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        console.print(f"Scores {json_out}")
