"""Build the reference pages from the code, at documentation build time.

Nothing under `reference/` is committed. Every page here is produced from the
thing it documents — the Typer app, the report models, the configuration
schema — so a flag that is renamed or a field that is removed changes the
documentation in the same commit, without anybody remembering to.

Run by `mkdocs` through `mkdocs-gen-files`; `mkdocs serve` reruns it on every
change.
"""

from __future__ import annotations

import json
from typing import Any

import mkdocs_gen_files

HIDDEN = {"--help", "--install-completion", "--show-completion"}


def command_pages() -> None:
    """One section per command, from the Typer app itself."""
    import click
    import typer.main

    from complydoc.cli import app

    root = typer.main.get_command(app)
    context = click.Context(root, info_name="complydoc")

    lines = [
        "# Command line",
        "",
        "Generated from the commands themselves, so this page cannot describe a",
        "flag the tool does not have.",
        "",
    ]

    for name in sorted(root.list_commands(context)):
        # Resolved through the group, because Typer builds its commands lazily
        # and the ones hanging off `.commands` carry no parameters yet.
        command = root.get_command(context, name)
        if command is None:  # pragma: no cover - a group that lists what it lacks
            continue
        lines += [f"## `complydoc {name}`", ""]
        help_text = (command.help or "").strip()
        if help_text:
            lines += [help_text, ""]

        # `param_type_name` rather than isinstance: Typer vendors its own copy
        # of click, so its parameters are not instances of the click classes
        # this module imports and every isinstance check quietly returned false.
        arguments = [p for p in command.params if p.param_type_name == "argument"]
        options = [
            p for p in command.params if p.param_type_name == "option" and not set(p.opts) & HIDDEN
        ]

        usage = " ".join(f"{{{a.name}}}" for a in arguments)
        lines += ["```bash", f"complydoc {name} {usage}".rstrip(), "```", ""]

        if arguments:
            lines += ["| Argument | What it is |", "| --- | --- |"]
            for argument in arguments:
                lines.append(f"| `{argument.name}` | {_help_of(argument, context)} |")
            lines.append("")

        if options:
            lines += ["| Option | Default | What it does |", "| --- | --- | --- |"]
            for option in options:
                flags = ", ".join(f"`{o}`" for o in option.opts + option.secondary_opts)
                lines.append(f"| {flags} | {_default_of(option)} | {_help_of(option, context)} |")
            lines.append("")

    with mkdocs_gen_files.open("reference/cli.md", "w") as page:
        page.write("\n".join(lines))


def _help_of(param: Any, context: Any) -> str:
    text = (getattr(param, "help", None) or "").strip()
    if not text:
        record = param.get_help_record(context)
        text = (record[1] if record else "").strip()
    return " ".join(text.split()).replace("|", "\\|") or "—"


def _default_of(option: Any) -> str:
    if option.is_flag or option.secondary_opts:
        return "on" if option.default else "off"
    if option.default in (None, "", 0):
        return "—"
    return f"`{option.default}`"


def api_page() -> None:
    """The Python API, from the docstrings that define it."""
    import complydoc

    names = [n for n in complydoc.__all__ if not n.startswith("_")]
    entry_points = [
        n
        for n in names
        if n.endswith("_audit") or n in {"extract_text", "inspect_documents", "compare_loaders"}
    ]
    results = [
        "TextResult",
        "Chunk",
        "ExtractionWarning",
        "LoaderRun",
        "MetadataFinding",
        "LoaderComparison",
        "LoaderSummary",
        "IdentifierDifference",
    ]
    plugging = [
        n for n in names if n.startswith(("register_", "all_")) or n == "supported_extensions"
    ]
    errors = [n for n in names if n.endswith("Error")]
    rest = [n for n in names if n not in {*entry_points, *results, *plugging, *errors}]

    lines = [
        "# Python API",
        "",
        "```python",
        "import complydoc as cd",
        "```",
        "",
        "Everything on this page is public and will not be renamed without a major",
        "version. Anything in the package that is *not* on this page is internal.",
        "",
    ]
    for heading, group in (
        ("Entry points", entry_points),
        ("What you get back", results),
        ("Bringing your own reader", plugging),
        ("Errors", errors),
        ("Everything else", rest),
    ):
        if not group:
            continue
        lines += [f"## {heading}", ""]
        for name in sorted(group):
            lines += [f"::: complydoc.{name}", "    options:", "      heading_level: 3", ""]

    with mkdocs_gen_files.open("reference/api.md", "w") as page:
        page.write("\n".join(lines))


def report_page() -> None:
    """The JSON a run writes, from the code that writes it."""
    from complydoc.report.models import SCHEMA_VERSION, report_shape

    lines = [
        "# Report JSON",
        "",
        f"`schema_version` is **{SCHEMA_VERSION}**. It moves when this shape moves,",
        "which is the field to branch on when reading a report programmatically.",
        "",
        "The same shape reaches you from `report.to_dict()` in Python and from",
        "`complydoc audit --print-json` on the command line.",
        "",
        "```json",
        json.dumps(report_shape(), indent=2),
        "```",
        "",
    ]
    with mkdocs_gen_files.open("reference/report.md", "w") as page:
        page.write("\n".join(lines))


def configuration_page() -> None:
    """The three config files, from the models that validate them."""
    from complydoc.config.schema import Config

    lines = [
        "# Configuration",
        "",
        "Three files — `pricing.yaml`, `readiness.yaml` and `sensitive.yaml`. The",
        "shipped set is used unless you point at your own with `--config-dir`, and",
        "a run records the digest of what it loaded so two reports can be compared",
        "honestly.",
        "",
        "Every field below is validated on load. A file that does not satisfy this",
        "stops the run with the reason rather than being half applied.",
        "",
    ]
    from pydantic import BaseModel

    for field, model in Config.model_fields.items():
        annotation = model.annotation
        # Only the three config sections. `Config` also carries the source
        # directory and the digest, and asking mkdocstrings to document `str`
        # produces a page of dunder methods.
        if not (isinstance(annotation, type) and issubclass(annotation, BaseModel)):
            continue
        lines += [
            f"## `{field}.yaml`",
            "",
            f"::: {annotation.__module__}.{annotation.__name__}",
            "    options:",
            "      heading_level: 3",
            "      show_bases: false",
            "",
        ]
    with mkdocs_gen_files.open("reference/configuration.md", "w") as page:
        page.write("\n".join(lines))


command_pages()
api_page()
report_page()
configuration_page()
