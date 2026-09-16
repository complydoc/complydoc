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
    result = run_benchmark(config.sensitive)

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

    imperfect = [
        score
        for score in sorted(result.categories.values(), key=lambda s: s.category)
        if not score.unmeasured and (score.missed or score.wrongly_flagged)
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
            f"[yellow]Not measured:[/] {', '.join(sorted(unmeasured))} — the corpus labels "
            f"no names, and a detector that cannot run scores nothing, so these are left "
            f"out of the totals."
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
