"""The report's JSON Schema: published as generated, and true of what a run writes."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import jsonschema
import pytest
from typer.testing import CliRunner

from complydoc.cli import app
from complydoc.report.models import SCHEMA_VERSION
from complydoc.report.schema import report_json_schema, schema_address

runner = CliRunner()
ROOT = Path(__file__).parents[2]
SAMPLE = ROOT / "src" / "complydoc" / "sample"


@pytest.fixture(scope="module")
def schema() -> dict[str, Any]:
    return report_json_schema()


def test_it_is_a_valid_schema_that_names_its_own_version(schema: dict[str, Any]):
    jsonschema.Draft202012Validator.check_schema(schema)
    assert (
        schema["$id"]
        == schema_address()
        == (f"https://complydoc.github.io/complydoc/docs/schema/report-{SCHEMA_VERSION}.json")
    )
    assert {"run", "documents"} <= set(schema["properties"])
    assert "run" in schema["required"]


def test_the_published_file_is_the_generated_one(schema: dict[str, Any]):
    """A schema version's file is written once and kept: this one must match the code."""
    published = ROOT / "docs" / "schema" / f"report-{SCHEMA_VERSION}.json"
    assert published.is_file(), (
        f"write it with: complydoc schema --json-schema > {published.relative_to(ROOT)}"
    )
    assert json.loads(published.read_text()) == schema, (
        "the report's shape changed without its schema file: write it again, and bump "
        "SCHEMA_VERSION if a released version already has this number"
    )


def test_the_command_prints_it(schema: dict[str, Any]):
    result = runner.invoke(app, ["schema", "--json-schema"])
    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == schema
    # The summary is still what the command prints when not asked for the schema.
    summary = json.loads(runner.invoke(app, ["schema"]).output)
    assert summary["schema_version"] == SCHEMA_VERSION


def undescribed(
    value: Any, described: Any, definitions: dict[str, Any], path: str = ""
) -> set[str]:
    """Keys in `value` that `described` has no place for, which validation alone lets through."""

    def options(node: Any) -> list[dict[str, Any]]:
        while isinstance(node, dict) and "$ref" in node:
            node = definitions[node["$ref"].rsplit("/", 1)[-1]]
        if not isinstance(node, dict):
            return []
        nested = [
            o
            for key in ("anyOf", "oneOf", "allOf")
            for sub in node.get(key, [])
            for o in options(sub)
        ]
        return nested or [node]

    found: set[str] = set()
    choices = options(described)
    if isinstance(value, dict):
        objects = [o for o in choices if "properties" in o or "additionalProperties" in o]
        if not objects:
            return found
        for key, item in value.items():
            named = next(
                (o["properties"][key] for o in objects if key in o.get("properties", {})), None
            )
            if named is not None:
                found |= undescribed(item, named, definitions, f"{path}/{key}")
                continue
            anything = next(
                (
                    o["additionalProperties"]
                    for o in objects
                    if o.get("additionalProperties") not in (None, False)
                ),
                None,
            )
            if anything is None:
                found.add(f"{path}/{key}")
            elif isinstance(anything, dict):
                found |= undescribed(item, anything, definitions, f"{path}/*")
    elif isinstance(value, list):
        items = next((o["items"] for o in choices if "items" in o), None)
        if items is not None:
            for item in value:
                found |= undescribed(item, items, definitions, f"{path}/[]")
    return found


def check(report: Path, schema: dict[str, Any]) -> None:
    data = json.loads(report.read_text())
    errors = [
        f"{'/'.join(map(str, error.absolute_path))}: {error.message[:160]}"
        for error in jsonschema.Draft202012Validator(schema).iter_errors(data)
    ]
    assert not errors, errors[:10]
    assert not undescribed(data, schema, schema["$defs"]), "keys the schema does not describe"


def test_an_audit_fits_the_schema_with_no_key_left_undescribed(
    tmp_path: Path, schema: dict[str, Any]
):
    out = tmp_path / "out"
    result = runner.invoke(
        app, ["audit", str(SAMPLE), "--out", str(out), "--no-ocr", "--page-images", "-q"]
    )
    assert result.exit_code == 0, result.output
    check(out / "complydoc.json", schema)


def test_a_chunks_run_fits_it_too(tmp_path: Path, schema: dict[str, Any]):
    out = tmp_path / "chunks"
    result = runner.invoke(
        app,
        [
            "chunks",
            str(SAMPLE / "terms-and-conditions.pdf"),
            "--out",
            str(out),
            "--no-ocr",
            "--preset",
            "common",
            "-q",
        ],
    )
    assert result.exit_code == 0, result.output
    written = sorted(out.glob("*.json"))
    assert written, "the chunks run wrote no report"
    for report in written:
        check(report, schema)


def test_a_file_that_is_not_a_report_does_not_fit(schema: dict[str, Any]):
    validator = jsonschema.Draft202012Validator(schema)
    assert list(validator.iter_errors({"documents": []}))
    assert list(
        validator.iter_errors({"run": {"schema_version": SCHEMA_VERSION}, "documents": "x"})
    )
