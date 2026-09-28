"""Make the documentation site's pages from `docs/` and from the code.

    uv run python src/scripts/build_docs.py      # then: cd docs-site && npx astro build

`docs/` is the source, written in Markdown. Each page is copied into the site's content
folder with what the site needs done to it: its first heading made its title, the
tested examples under `docs/examples` included where a page names them, notes made the
site's asides, and links between pages made the site's addresses.

The reference pages are not written by hand. They are made here from the thing each
documents: the command line from the Typer app, the Python API and the configuration
from the code and its docstrings, the report's shape from the code that writes it, and
the identifiers from the shipped configuration. A flag renamed or a field removed
changes the documentation in the same commit.

Nothing under `docs-site/src/content/docs` is committed.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
OUT = ROOT / "docs-site" / "src" / "content" / "docs"
BASE = "/complydoc/docs"
"""Where the site is served from, which absolute links between pages start with."""

SKIP = {"design", "examples", "assets"}
"""Folders of `docs/` that are not pages: design notes, the examples pages include, images."""

HIDDEN = {"--help", "--install-completion", "--show-completion"}

sys.path.insert(0, str(ROOT / "src"))


# ------------------------------------------------------------------ pages from docs/


def _title(text: str) -> tuple[str, str]:
    """The page's first heading, and the page without it."""
    match = re.search(r"^# (.+)$", text, re.M)
    if not match:
        return "", text
    return match.group(1).strip(), text[: match.start()] + text[match.end() :].lstrip("\n")


def _snippets(text: str) -> str:
    """Each `--8<-- "examples/x.py"` line replaced by the file it names."""

    def include(match: re.Match[str]) -> str:
        path = DOCS / match.group(2)
        if not path.is_file():
            raise SystemExit(f"a page includes {match.group(2)}, which does not exist")
        return path.read_text(encoding="utf-8").rstrip("\n")

    return re.sub(r'^(\s*)--8<-- "([^"]+)"\s*$', include, text, flags=re.M)


_ASIDE = {"note": "note", "tip": "tip", "info": "note", "warning": "caution", "danger": "danger"}


def _asides(text: str) -> str:
    """`!!! note "Title"` and its indented body, as the site's `:::note[Title]` aside."""
    lines = text.split("\n")
    out: list[str] = []
    index = 0
    while index < len(lines):
        match = re.match(r'^!!! (\w+)(?: "([^"]*)")?\s*$', lines[index])
        if not match:
            out.append(lines[index])
            index += 1
            continue
        kind = _ASIDE.get(match.group(1), "note")
        out.append(f":::{kind}[{match.group(2)}]" if match.group(2) else f":::{kind}")
        index += 1
        while index < len(lines) and (lines[index].startswith("    ") or not lines[index].strip()):
            if (
                not lines[index].strip()
                and index + 1 < len(lines)
                and not lines[index + 1].startswith("    ")
            ):
                break
            out.append(lines[index][4:])
            index += 1
        out.append(":::")
    return "\n".join(out)


def _links(text: str, page: PurePosixPath) -> str:
    """Links to other pages (`../guides/x.md#part`) as the site's addresses."""

    def address(match: re.Match[str]) -> str:
        target, fragment = match.group(2), match.group(3) or ""
        resolved: list[str] = []
        for part in (page.parent / target).parts:
            if part == "..":
                resolved.pop()
            elif part != ".":
                resolved.append(part)
        slug = "/".join(resolved)[: -len(".md")]
        slug = "" if slug == "index" else f"{slug}/"
        return f"{match.group(1)}({BASE}/{slug}{fragment})"

    return re.sub(r"(\[[^\]]*\])\((?!https?:|#|/)([^)#\s]+\.md)(#[^)\s]*)?\)", address, text)


def _page(source: Path) -> None:
    relative = PurePosixPath(source.relative_to(DOCS).as_posix())
    text = source.read_text(encoding="utf-8")
    if source.suffix == ".mdx":
        # Written for the site already, components and all; only its links are the site's.
        body = _links(text, relative.with_suffix(".md"))
        target = OUT / relative
    else:
        title, body = _title(text)
        body = _links(_asides(_snippets(body)), relative)
        body = f"---\ntitle: {json.dumps(title)}\n---\n\n{body}"
        target = OUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding="utf-8")


def pages() -> int:
    count = 0
    for source in sorted(DOCS.rglob("*.md*")):
        parts = source.relative_to(DOCS).parts
        if parts[0] in SKIP or source.suffix not in (".md", ".mdx"):
            continue
        _page(source)
        count += 1
    return count


# ------------------------------------------------------------------ reference pages


def _write(path: str, title: str, body: list[str]) -> None:
    target = OUT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(body)).rstrip() + "\n"
    target.write_text(f"---\ntitle: {json.dumps(title)}\n---\n\n{text}", encoding="utf-8")


def _cell(text: str) -> str:
    return " ".join(text.split()).replace("|", "\\|") or "—"


def command_page() -> None:
    """One section per command, from the Typer app itself."""
    import click
    import typer.main

    from complydoc.cli import app

    root = typer.main.get_command(app)
    context = click.Context(root, info_name="complydoc")
    lines = [
        "Generated from the commands themselves, so this page cannot describe a",
        "flag the tool does not have.",
        "",
    ]
    for name in sorted(root.list_commands(context)):
        # Resolved through the group: Typer builds its commands lazily, and the ones
        # hanging off `.commands` carry no parameters yet.
        command = root.get_command(context, name)
        if command is None:  # pragma: no cover - a group that lists what it lacks
            continue
        lines += [f"## `complydoc {name}`", ""]
        help_text = (command.help or "").strip()
        if help_text:
            lines += [help_text, ""]
        # Typer vendors its own click, so isinstance checks fail; `param_type_name` works.
        arguments = [p for p in command.params if p.param_type_name == "argument"]
        options = [
            p for p in command.params if p.param_type_name == "option" and not set(p.opts) & HIDDEN
        ]
        usage = " ".join(f"{{{a.name}}}" for a in arguments)
        lines += ["```bash", f"complydoc {name} {usage}".rstrip(), "```", ""]
        if arguments:
            lines += ["| Argument | What it is |", "| --- | --- |"]
            lines += [f"| `{a.name}` | {_help_of(a, context)} |" for a in arguments]
            lines.append("")
        if options:
            lines += ["| Option | Default | What it does |", "| --- | --- | --- |"]
            for option in options:
                flags = ", ".join(f"`{o}`" for o in option.opts + option.secondary_opts)
                lines.append(f"| {flags} | {_default_of(option)} | {_help_of(option, context)} |")
            lines.append("")
    _write("reference/cli.md", "Command line", lines)


def _help_of(param: Any, context: Any) -> str:
    text = (getattr(param, "help", None) or "").strip()
    if not text:
        record = param.get_help_record(context)
        text = (record[1] if record else "").strip()
    return _cell(text)


def _default_of(option: Any) -> str:
    if option.is_flag or option.secondary_opts:
        return "on" if option.default else "off"
    if option.default in (None, "", 0):
        return "—"
    return f"`{option.default}`"


def _griffe() -> Any:
    import griffe

    return griffe.load("complydoc", search_paths=[str(ROOT / "src")], allow_inspection=False)


def _resolved(obj: Any) -> Any:
    return obj.final_target if obj.is_alias else obj


def _docstring(obj: Any) -> str:
    return obj.docstring.value.strip() if obj.docstring else ""


def _signature(name: str, function: Any) -> str:
    parts = []
    for parameter in function.parameters:
        if parameter.name in ("self", "cls"):
            continue
        stars = {"variadic positional": "*", "variadic keyword": "**"}
        prefix = stars.get(parameter.kind.value, "")
        text = f"{prefix}{parameter.name}"
        if parameter.annotation is not None:
            text += f": {parameter.annotation}"
        if parameter.default is not None and not prefix:
            text += f" = {parameter.default}"
        parts.append(text)
    returns = f" -> {function.returns}" if function.returns is not None else ""
    one_line = f"{name}({', '.join(parts)}){returns}"
    if len(one_line) <= 88:
        return one_line
    inner = "".join(f"    {part},\n" for part in parts)
    return f"{name}(\n{inner}){returns}"


def _set_in_init(cls: Any, member: Any) -> bool:
    init = cls.members.get("__init__")
    if init is None or init.is_alias or member.lineno is None:
        return False
    return bool(init.lineno <= member.lineno <= (init.endlineno or init.lineno))


def _attributes(cls: Any) -> list[str]:
    rows = []
    for member_name, member in cls.members.items():
        member = _resolved(member)
        if member_name.startswith("_") or member.kind.value != "attribute":
            continue
        # State set up in `__init__` is the class's business unless it says what it is.
        if not member.docstring and (_set_in_init(cls, member) or "property" in member.labels):
            continue
        kind = f"`{_cell(str(member.annotation))}`" if member.annotation is not None else "—"
        default = f" = `{member.value}`" if member.value is not None else ""
        rows.append(f"| `{member_name}` | {kind}{default} | {_cell(_docstring(member))} |")
    if not rows:
        return []
    return ["| Field | Type | What it is |", "| --- | --- | --- |", *rows, ""]


def _methods(cls: Any, owner: str) -> list[str]:
    lines = []
    for member_name, member in cls.members.items():
        member = _resolved(member)
        if member_name.startswith("_") or member.kind.value != "function":
            continue
        doc = _docstring(member)
        if not doc:
            continue
        lines += [
            f"#### `{owner}.{member_name}`",
            "",
            "```python",
            _signature(member_name, member),
            "```",
            "",
            doc,
            "",
        ]
    return lines


def _describe(name: str, obj: Any) -> list[str]:
    obj = _resolved(obj)
    kind = obj.kind.value
    lines = [f"### `cd.{name}`", ""]
    if kind == "function":
        lines += ["```python", _signature(name, obj), "```", "", _docstring(obj), ""]
    elif kind == "class":
        lines += ["```python", f"class {name}", "```", "", _docstring(obj), ""]
        lines += _attributes(obj)
        lines += _methods(obj, name)
    elif kind == "module":
        lines += [_docstring(obj), ""]
        # Only what the module defines: its imports are aliases, and not its to document.
        functions = [
            (n, m)
            for n, m in obj.members.items()
            if not n.startswith("_") and not m.is_alias and m.kind.value == "function"
        ]
        for function_name, function in functions:
            lines += ["```python", _signature(f"{name}.{function_name}", function), "```", ""]
            lines += [_docstring(function), ""]
    else:
        lines += [_docstring(obj), ""]
    return lines


def api_page() -> None:
    """The Python API, from the docstrings that define it."""
    import complydoc

    package = _griffe()
    api = package["api"]
    names = [n for n in complydoc.__all__ if not n.startswith("_") and n != "__version__"]
    groups: dict[str, set[str]] = {
        "Observing a pipeline": {
            "observe", "stage", "Observation", "Trace", "TraceStage", "StageIdentifier",
        },
        "Audits and inspection": {n for n in names if n.endswith("_audit")} | {
            "extract_text", "inspect_documents", "compare_loaders", "inspect_chunks",
            "compare_chunkers", "check_facts",
        },
        "Strings": {"scan_text", "mask_text", "find_hidden", "count_tokens"},
        "Reports and tests": {
            "load_report", "write_json", "diff_reports", "expect", "load_config", "launch_ui",
        },
        "Pipeline steps": {
            "Step", "StepChange", "MaskIdentifiers", "DropHiddenPassages", "StripPathMetadata",
        },
        "Extending": {n for n in names if n.startswith(("register_", "all_"))} | {
            "supported_extensions", "Detector", "DetectorContext", "Finding", "Signal",
            "Measurement", "Loader", "Extractor", "Engine", "LoaderSpec", "parsers",
        },
        "Errors": {n for n in names if n.endswith("Error")},
    }  # fmt: skip
    grouped = set().union(*groups.values())
    groups["Results and types"] = {n for n in names if n not in grouped}

    lines = [
        "```python",
        "import complydoc as cd",
        "```",
        "",
        "Everything on this page is public. Anything in the package that is not on this",
        "page is internal.",
        "",
    ]
    for heading, group in groups.items():
        present = sorted(n for n in group if n in names)
        if not present:
            continue
        lines += [f"## {heading}", ""]
        for name in present:
            lines += _describe(name, api[name])
    _write("reference/api.md", "Python API", lines)


def report_page() -> None:
    """The JSON a run writes, from the code that writes it."""
    from complydoc.report.models import SCHEMA_VERSION, report_shape

    lines = [
        f"`schema_version` is **{SCHEMA_VERSION}**. It moves when this shape moves,",
        "which is the field to branch on when reading a report programmatically.",
        "",
        "The same shape reaches you from `report.to_dict()` in Python and from",
        "`complydoc audit --print-json` on the command line.",
        "",
        "```json",
        json.dumps(report_shape(), indent=2),
        "```",
    ]
    _write("reference/report.md", "Report JSON", lines)


def configuration_page() -> None:
    """The configuration files, from the models that validate them."""
    from pydantic import BaseModel

    from complydoc.config.schema import Config

    package = _griffe()
    lines = [
        "Four files: `pricing.yaml`, `readiness.yaml`, `sensitive.yaml` and",
        "`hidden.yaml`. The shipped set is used unless you point at your own with",
        "`--config-dir` (where `hidden.yaml` is optional). A run records the digest",
        "of the files it loaded.",
        "",
        "Every field below is validated on load. A file that fails validation stops",
        "the run with the reason.",
        "",
    ]
    for field, model in Config.model_fields.items():
        annotation = model.annotation
        # Only the config sections: `Config` also carries its source directory and digest.
        if not (isinstance(annotation, type) and issubclass(annotation, BaseModel)):
            continue
        cls = package[f"{annotation.__module__.removeprefix('complydoc.')}.{annotation.__name__}"]
        lines += [f"## `{field}.yaml`", "", _docstring(cls), ""]
        lines += _attributes(cls)
    _write("reference/configuration.md", "Configuration", lines)


def identifiers_page() -> None:
    """Every identifier category in the shipped `sensitive.yaml`."""
    from complydoc.config.loader import load_config

    categories = load_config().sensitive.categories
    lines = [
        "The identifier categories in the shipped `sensitive.yaml`. **On sight** means the",
        "pattern is reported wherever it matches; **near a label** means it is reported only",
        "when one of the category's context terms is close by. A category with validators",
        "reaches the `confirmed` evidence tier when they pass.",
        "",
        "| Category | Id | Region | Severity | Found | Validators |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for category_id, category in categories.items():
        if category.detector == "ner":
            found = "name detection model"
        elif category.patterns and category.context_patterns:
            found = "on sight, or near a label"
        elif category.patterns:
            found = "on sight"
        else:
            found = "near a label"
        validators = ", ".join(f"`{name}`" for name in category.validators) or "—"
        lines.append(
            f"| {category.label} | `{category_id}` | {category.region} | {category.severity} "
            f"| {found} | {validators} |"
        )
    _write("reference/identifiers.md", "Identifiers", lines)


def build(out: Path = OUT) -> int:
    """Write every page into `out`, emptied first, and return how many came from `docs/`."""
    global OUT
    OUT = out
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    written = pages()
    command_page()
    api_page()
    report_page()
    configuration_page()
    identifiers_page()
    return written


def main() -> int:
    written = build()
    print(f"{written} pages from docs/, and 5 reference pages, in {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
