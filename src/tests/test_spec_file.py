"""Loader comparisons described in a YAML file."""

from __future__ import annotations

import pytest

from complydoc.config.loader import ConfigError
from complydoc.loaders.spec_file import compare_from_file, read_comparison_file
from complydoc.utils.imports import load_object


def fake_loader(path: str) -> list[dict]:
    return [
        {
            "page_content": f"Payment is due within thirty days. {path}",
            "metadata": {"source": path, "page": 0},
        }
    ]


class PrefixedLoader:
    def __init__(self, path: str, prefix: str = "") -> None:
        self.path = path
        self.prefix = prefix

    def load(self) -> list[dict]:
        return [
            {"page_content": f"{self.prefix} text", "metadata": {"source": self.path, "page": 0}}
        ]


@pytest.fixture
def spec(tmp_path):
    folder = tmp_path / "docs"
    folder.mkdir()
    for name in ("a.pdf", "b.pdf"):
        (folder / name).write_bytes(b"%PDF-1.4 " + name.encode())
    path = tmp_path / "comparison.yaml"
    path.write_text(
        """
loaders:
  full: tests.test_spec_file:fake_loader
  short:
    loader: tests.test_spec_file:PrefixedLoader
    options: {prefix: Invoice}
paths: docs
facts:
  - Payment is due within thirty days
components: [sensitive]
"""
    )
    return path


def test_a_file_runs_a_comparison(spec):
    report = compare_from_file(spec)
    comparison = report.loader_comparison
    assert [row.name for row in comparison.loaders] == ["full", "short"]
    assert [row.documents for row in comparison.loaders] == [2, 2]
    assert [row.facts_found for row in comparison.loaders] == [1, 0]


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("loaders: {a: x:y}\npaths: .", "at least two loaders"),
        ("loaders: {a: {loader: x:y, preset: docling}, b: x:y}\npaths: .", "exactly one"),
        ("loaders: {a: {preset: nope}, b: x:y}\npaths: .", "unknown preset"),
        ("loaders: {a: x:y, b: x:y}\npaths: .\ncomponents: [speed]", "unknown components"),
        ("loaders: {a: x:y, b: x:y}\npaths: .\nextra: 1", "Extra inputs"),
    ],
)
def test_an_invalid_file_is_rejected(tmp_path, content, message):
    path = tmp_path / "bad.yaml"
    path.write_text(content)
    with pytest.raises(ConfigError, match=message):
        read_comparison_file(path)


def test_load_object():
    assert load_object("tests.test_spec_file:PrefixedLoader") is PrefixedLoader
    with pytest.raises(ValueError, match="module:attribute"):
        load_object("tests.test_spec_file")
    with pytest.raises(ValueError, match="no attribute"):
        load_object("tests.test_spec_file:missing")
