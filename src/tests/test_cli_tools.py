"""The compare-loaders, chunks and diff commands."""

from __future__ import annotations

import json

import pytest
from typer.testing import CliRunner

from complydoc.cli import app

runner = CliRunner()

EMAIL = "jane.doe@example.com"


def paragraphs(documents):
    """A splitter that makes one chunk per paragraph."""
    return [
        {"page_content": part, "metadata": dict(d["metadata"])}
        for d in documents
        for part in d["page_content"].splitlines()
        if part.strip()
    ]


class Halves:
    def __init__(self, parts: int = 2) -> None:
        self.parts = parts

    def split_documents(self, documents):
        chunks = []
        for d in documents:
            text = d["page_content"]
            size = max(1, len(text) // self.parts)
            chunks += [
                {"page_content": text[i : i + size], "metadata": dict(d["metadata"])}
                for i in range(0, len(text), size)
            ]
        return chunks


def write_docx(path, *paragraphs):
    import docx

    document = docx.Document()
    for text in paragraphs:
        document.add_paragraph(text)
    document.save(str(path))


@pytest.fixture
def folder(tmp_path):
    root = tmp_path / "docs"
    root.mkdir()
    write_docx(
        root / "terms.docx",
        "Terms of supply between the parties named below.",
        "Payment is due within thirty days of the invoice date.",
        f"Contact {EMAIL} with questions.",
    )
    return root


def test_chunks_writes_a_masked_report(folder, tmp_path):
    out = tmp_path / "out"
    result = runner.invoke(
        app,
        [
            "chunks", str(folder), "--splitter", "tests.test_cli_tools:paragraphs",
            "--fact", "Payment is due within thirty days", "--out", str(out), "--quiet",
        ],
    )  # fmt: skip
    assert result.exit_code == 0, result.output
    data = json.loads((out / "complydoc-chunks.json").read_text())
    [report] = data["chunkers"]
    assert report["stats"]["count"] == 3
    assert report["facts"][0]["status"] == "whole"
    page = (out / "complydoc-chunks.html").read_text()
    assert EMAIL not in page and EMAIL not in json.dumps(data)
    assert "Expected facts" in page


def test_chunks_compares_several_splitters(folder, tmp_path):
    out = tmp_path / "out"
    result = runner.invoke(
        app,
        [
            "chunks", str(folder),
            "--splitter", "tests.test_cli_tools:Halves parts=2",
            "--splitter", "tests.test_cli_tools:Halves parts=4",
            "--out", str(out),
        ],
    )  # fmt: skip
    assert result.exit_code == 0, result.output
    data = json.loads((out / "complydoc-chunks.json").read_text())
    names = [r["chunker"] for r in data["chunkers"]]
    assert names == ["Halves parts=2", "Halves parts=4"]
    assert "Splitters" in (out / "complydoc-chunks.html").read_text()
    assert "Halves parts=4" in result.output


@pytest.mark.parametrize(
    ("splitter", "message"),
    [
        ("tests.test_cli_tools", "module:attribute"),
        ("tests.test_cli_tools:missing", "no attribute"),
        ("tests.test_cli_tools:Halves parts", "key=value"),
    ],
)
def test_chunks_rejects_a_bad_splitter(folder, tmp_path, splitter, message):
    result = runner.invoke(
        app, ["chunks", str(folder), "--splitter", splitter, "--out", str(tmp_path)]
    )
    assert result.exit_code == 2
    assert message in result.output


def audit(folder, out, name):
    result = runner.invoke(
        app, ["sensitive", str(folder), "--out", str(out), "--name", name, "--no-ocr", "-q"]
    )
    assert result.exit_code == 0, result.output
    return out / f"{name}.json"


def test_diff_fails_on_a_regression_and_passes_otherwise(folder, tmp_path):
    write_docx(folder / "terms.docx", "Terms of supply between the parties named below.")
    before = audit(folder, tmp_path, "before")
    write_docx(folder / "terms.docx", f"Terms of supply. Contact {EMAIL}.")
    after = audit(folder, tmp_path, "after")

    worse = runner.invoke(app, ["diff", str(before), str(after), "--out", str(tmp_path)])
    assert worse.exit_code == 1, worse.output
    assert "worse  identifiers added: terms.docx: Email address" in worse.output
    assert EMAIL not in worse.output
    page = (tmp_path / "complydoc-diff.html").read_text()
    assert "Regressions" in page and EMAIL not in page
    data = json.loads((tmp_path / "complydoc-diff.json").read_text())
    assert f"{data['regressions']} regression" in worse.output
    assert any(c["area"] == "identifiers" and c["worse"] for c in data["changes"])

    assert runner.invoke(app, ["diff", str(after), str(before)]).exit_code == 0
    assert runner.invoke(app, ["diff", str(after), str(after)]).exit_code == 0
    allowed = runner.invoke(app, ["diff", str(before), str(after), "--no-fail-on-regression"])
    assert allowed.exit_code == 0


def test_diff_rejects_a_file_that_is_not_a_report(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text('{"run": {}}')
    result = runner.invoke(app, ["diff", str(bad), str(bad)])
    assert result.exit_code == 2


def test_compare_loaders_runs_a_comparison_file(tmp_path):
    (tmp_path / "docs").mkdir()
    for name in ("a.pdf", "b.pdf"):
        (tmp_path / "docs" / name).write_bytes(b"%PDF-1.4 " + name.encode())
    spec = tmp_path / "loaders.yaml"
    spec.write_text(
        "loaders:\n"
        "  full: tests.test_spec_file:fake_loader\n"
        "  short: {loader: tests.test_spec_file:PrefixedLoader, options: {prefix: Invoice}}\n"
        "paths: docs\n"
        "facts: [Payment is due within thirty days]\n"
        "components: [sensitive]\n"
    )
    out = tmp_path / "out"
    result = runner.invoke(app, ["compare-loaders", str(spec), "--out", str(out)])
    assert result.exit_code == 0, result.output
    assert (out / "complydoc-loaders.html").exists()
    data = json.loads((out / "complydoc-loaders.json").read_text())
    assert [row["name"] for row in data["loader_comparison"]["loaders"]] == ["full", "short"]

    spec.write_text("loaders: {only: tests.test_spec_file:fake_loader}\npaths: docs\n")
    assert runner.invoke(app, ["compare-loaders", str(spec)]).exit_code == 2
