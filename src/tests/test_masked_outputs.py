"""A default run writes no identifier it found in the clear, anywhere.

The findings table always masked its values, while the page text beside it, and
a picture of each page, carried the same values in full. These tests read every
file a default run writes and look for the values themselves.

Only checksum-confirmed values are looked for in a real run. A name is found by
a model, and a model misses. What a model found in one reading of a page is
covered in every reading of it, though, which the tests at the end pin down with
a pattern that finds a name in one wording and not the other.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from typer.testing import CliRunner

from complydoc.cli import app
from complydoc.ingest.base import IngestOptions
from complydoc.ingest.registry import load_document
from complydoc.sensitive.scanner import scan
from tests.helpers import FIXTURES

runner = CliRunner()

SOURCE = FIXTURES / "sensitive_sample.pdf"


@pytest.fixture(scope="module")
def confirmed_values(config) -> list[str]:
    document = load_document(SOURCE, IngestOptions(ocr=False))
    found = scan(document, config.sensitive, reveal=True)
    values = sorted({m.revealed for m in found.matches if m.evidence == "confirmed" and m.revealed})
    assert values, "the fixture holds checksum-confirmed identifiers"
    return values


@pytest.fixture
def folder(tmp_path: Path) -> Path:
    target = tmp_path / "in"
    target.mkdir()
    shutil.copy(SOURCE, target / SOURCE.name)
    return target


def _written(root: Path) -> str:
    return "\n".join(
        path.read_text(encoding="utf-8", errors="replace")
        for path in sorted(root.rglob("*"))
        if path.is_file()
    )


def _audit(folder: Path, out: Path, *extra: str) -> None:
    result = runner.invoke(
        app,
        [
            "audit",
            str(folder),
            "--out",
            str(out),
            "--no-ocr",
            "--jobs",
            "1",
            # A second reader, so the readings kept beside the text are covered too.
            "--compare-extractor",
            "pypdf",
            "--save-text",
            str(out / "text"),
            "--quiet",
            *extra,
        ],
    )
    assert result.exit_code == 0, result.output


def test_a_default_audit_writes_no_confirmed_value(tmp_path, folder, confirmed_values):
    out = tmp_path / "out"
    _audit(folder, out)
    written = _written(out)
    assert "text" in {p.name for p in out.iterdir()}, "the saved text is checked as well"
    leaked = [value for value in confirmed_values if value in written]
    assert not leaked, f"written in the clear: {len(leaked)} of {len(confirmed_values)}"


def test_a_default_audit_embeds_no_page_picture(tmp_path, folder):
    out = tmp_path / "out"
    _audit(folder, out)
    assert "data:image/jpeg" not in _written(out)


def test_reveal_still_shows_the_values(tmp_path, folder, confirmed_values):
    out = tmp_path / "out"
    _audit(folder, out, "--reveal")
    written = _written(out)
    assert any(value in written for value in confirmed_values)


def test_page_pictures_are_opt_in_and_disclosed(tmp_path, folder):
    out = tmp_path / "out"
    _audit(folder, out, "--page-images")
    written = _written(out)
    # Beside the report, not in it: the pictures made most of a large report.
    assert "data:image/jpeg" not in written
    pictures = sorted((out / "complydoc.parts" / "pages").glob("*.jpg"))
    assert pictures and all(p.read_bytes()[:2] == b"\xff\xd8" for p in pictures)
    assert f"complydoc.parts/pages/{pictures[0].name}" in written
    assert "keeps a picture of each page" in written


def test_reveal_keeps_a_masked_copy_of_each_page_for_the_viewer(tmp_path, folder, confirmed_values):
    out = tmp_path / "out"
    _audit(folder, out, "--reveal")
    (document,) = json.loads((out / "complydoc.json").read_text())["documents"]
    pages = document["extracted_text"]
    shown = "\n".join(p["text"] for p in pages)
    covered = "\n".join(
        [p["masked_text"] for p in pages]
        + [text for p in pages for text in p["masked_readings"].values()]
    )
    assert any(value in shown for value in confirmed_values)
    assert not [value for value in confirmed_values if value in covered]
    assert all(p["masked_readings"].keys() == p["readings"].keys() for p in pages)


def test_a_default_audit_keeps_no_second_copy(tmp_path, folder):
    out = tmp_path / "out"
    _audit(folder, out)
    (document,) = json.loads((out / "complydoc.json").read_text())["documents"]
    assert all(p.get("masked_text") is None for p in document["extracted_text"])


# --- A value found in one reading is covered in every reading ----------------


class _Doc:
    def __init__(self, page_content: str, metadata: dict) -> None:
        self.page_content = page_content
        self.metadata = metadata


def _labelled(path: str) -> list[_Doc]:
    return [_Doc("Finance lead: Chloe Adeyemi", {"source": path, "page": 0})]


def _bare(path: str) -> list[_Doc]:
    return [_Doc("Finance Chloe Adeyemi", {"source": path, "page": 0})]


def _found_after_a_label(config):
    """A detector that sees the name only where a label comes before it, as a model might."""
    from complydoc.concepts import Concept, ConceptFile, with_concepts

    concept = Concept(
        id="lead", label="Lead", description="A named lead.", pattern="(?<=lead: )Chloe Adeyemi"
    )
    # The name model would see it in both wordings; the pattern alone decides here.
    quiet = config.override(
        {
            "sensitive.categories.person_name.enabled": False,
            "sensitive.categories.organisation_name.enabled": False,
        }
    )
    return with_concepts(quiet, ConceptFile(concepts=[concept]))


@pytest.mark.parametrize("baseline", ["labelled", "bare"])
def test_a_name_one_loader_yielded_is_covered_in_every_loaders_reading(tmp_path, config, baseline):
    import complydoc as cd

    (tmp_path / "a.pdf").write_bytes(b"%PDF-1.4 placeholder")
    loaders = {"labelled": _labelled, "bare": _bare}
    order = [baseline, *(name for name in loaders if name != baseline)]
    report = cd.compare_loaders(
        {name: loaders[name] for name in order},
        paths=tmp_path,
        config=_found_after_a_label(config),
        components=["sensitive"],
    )
    page = report.documents[0].extracted_text[0]
    for text in [page.text, *page.readings.values()]:
        assert "Chloe Adeyemi" not in text, text


def test_a_name_one_extractor_yielded_is_covered_in_the_kept_text_and_the_ocr(tmp_path, config):
    """The same on an audit: the text layer, OCR and another extractor read one page."""
    from complydoc.audit.entry import _page_text
    from complydoc.audit.run import plan_audit
    from complydoc.ingest.base import Page

    page = Page(
        number=1,
        width_pt=595,
        height_pt=842,
        text="Finance Chloe Adeyemi",
        text_source="native",
        ocr_text="Finance Chloe Adeyemi",
        readings={"pypdf": "Finance lead: Chloe Adeyemi"},
    )
    work = plan_audit(tmp_path, _found_after_a_label(config), ("sensitive",)).work
    written = _page_text(page, None, work)
    for text in [written.text, written.ocr_text, *written.readings.values()]:
        assert "Chloe Adeyemi" not in text, text
