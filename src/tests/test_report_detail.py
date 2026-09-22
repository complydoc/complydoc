"""The two shapes a JSON report can be written in.

`summary` is the default and leaves out two things: the price of every document
on every model, which was also stored twice, and the page geometry the HTML draws
with. Both are most of a large report and neither is what a reader of the JSON
came for. What these tests hold to is that nothing else changes, that the folder's
cost per model survives, and that a summary reads back as what it is.
"""

from __future__ import annotations

import json

import pytest
from typer.testing import CliRunner

import complydoc as cd
from complydoc.cli import app
from complydoc.report.json_writer import to_dict
from tests.helpers import FIXTURES

runner = CliRunner()

SAMPLE = FIXTURES.parent.parent / "complydoc" / "sample"


@pytest.fixture(scope="module")
def report(config):
    return cd.full_audit(SAMPLE, config=config, ocr=False)


def test_a_summary_leaves_out_the_price_list_and_the_page_geometry(report):
    data = to_dict(report, detail="summary")
    assert data["run"]["report_detail"] == "summary"
    assert "documents" not in data["cost"], "the per-document price list"
    for document in data["documents"]:
        assert "previews" not in document
        assert "models" not in document["cost"]


def test_a_summary_keeps_the_folders_cost_on_every_model(report):
    data = to_dict(report, detail="summary")
    models = data["cost"]["models"]
    assert len(models) == len(report.cost.documents[0].models), "one row per priced model"
    paths = {a["key"] for a in models[0]["architectures"]}
    assert paths == {"text_layer", "text_ocr", "vision"}


def test_a_full_report_writes_every_field(report):
    data = to_dict(report, detail="full")
    assert data["run"]["report_detail"] == "full"
    assert data["cost"]["documents"]
    assert all("models" in d["cost"] for d in data["documents"])
    assert all("previews" in d for d in data["documents"])


def test_the_two_shapes_agree_on_everything_they_share(report):
    summary, full = to_dict(report, detail="summary"), to_dict(report, detail="full")
    for key in summary:
        if key not in ("cost", "documents", "run"):
            assert summary[key] == full[key], key
    assert summary["cost"]["models"] == full["cost"]["models"]
    for short, long in zip(summary["documents"], full["documents"], strict=True):
        kept = {k for k in long if k not in ("previews", "cost")}
        assert {k: short[k] for k in kept} == {k: long[k] for k in kept}


@pytest.mark.parametrize("detail", ["summary", "full"])
def test_each_shape_reads_back_as_it_was_written(report, detail):
    written = to_dict(report, detail=detail)
    loaded = cd.load_report(written)
    assert loaded.run.report_detail == detail, "a reader can tell what was left out"
    assert to_dict(loaded, detail=detail) == written


def test_a_summary_is_a_fraction_of_the_size(report):
    summary = len(json.dumps(to_dict(report, detail="summary")))
    full = len(json.dumps(to_dict(report, detail="full")))
    assert summary < full / 2


def test_an_unknown_shape_is_refused(report):
    with pytest.raises(ValueError, match="summary, full"):
        to_dict(report, detail="everything")  # type: ignore[arg-type]


def test_the_command_writes_a_summary_unless_asked_for_everything(tmp_path):
    common = ["audit", str(FIXTURES / "native_text.pdf"), "--no-ocr", "--quiet"]
    for folder, extra in (("s", []), ("f", ["--detail", "full"])):
        result = runner.invoke(app, [*common, "--out", str(tmp_path / folder), *extra])
        assert result.exit_code == 0, result.output

    summary = json.loads((tmp_path / "s" / "complydoc.json").read_text())
    full = json.loads((tmp_path / "f" / "complydoc.json").read_text())
    assert summary["run"]["report_detail"] == "summary"
    assert full["run"]["report_detail"] == "full"
    assert "documents" not in summary["cost"] and full["cost"]["documents"]
