"""A large report keeps its page text, layout and pictures beside it, and reads back whole."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import complydoc as cd
from complydoc.report import json_writer
from complydoc.report.json_reader import load_report

SAMPLE = Path(cd.__file__).parent / "sample"


@pytest.fixture(scope="module")
def report():  # type: ignore[no-untyped-def]
    return cd.full_audit(
        SAMPLE, compare_extractors=["pypdf"], page_images=True, extracted_text=True, jobs=1
    )


def test_a_small_report_is_one_file_but_for_its_pictures(report, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    path = cd.write_json(report, tmp_path / "complydoc.json", detail="full")
    data = json.loads(path.read_text())
    assert not (tmp_path / "complydoc.parts" / "documents").exists()
    assert all("parts" not in d for d in data["documents"])
    assert any(p.get("image") for d in data["documents"] for p in d.get("previews") or [])


def test_a_large_report_keeps_each_documents_detail_beside_it(
    report, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:  # type: ignore[no-untyped-def]
    whole = cd.write_json(report, tmp_path / "whole.json", detail="full").read_text()
    monkeypatch.setattr(json_writer, "SPLIT_ABOVE", 0)
    path = cd.write_json(report, tmp_path / "split.json", detail="full")
    data = json.loads(path.read_text())

    document = next(d for d in data["documents"] if d["extracted_text"])
    assert document["parts"].startswith("split.parts/documents/")
    page = document["extracted_text"][0]
    # What the pages are priced and listed by stays; their text and layout do not.
    assert "text" not in page and "characters" in page
    assert set(page["readings"].values()) <= {json_writer.HELD, ""}
    assert all("text_blocks" not in p for p in document["previews"])
    assert len(path.read_text()) < len(whole)

    # Read back, it is the report written whole, but for where the pictures are.
    back = json_writer.to_dict(load_report(path), detail="full")
    again = json_writer.to_dict(load_report(tmp_path / "whole.json"), detail="full")
    for ours, theirs in zip(back["documents"], again["documents"], strict=True):
        assert ours["extracted_text"] == theirs["extracted_text"]
        for mine, other in zip(ours["previews"], theirs["previews"], strict=True):
            mine.pop("image"), other.pop("image")
            assert mine == other


def test_writing_again_leaves_nothing_from_the_run_before(
    report, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(json_writer, "SPLIT_ABOVE", 0)
    path = cd.write_json(report, tmp_path / "complydoc.json", detail="full")
    monkeypatch.setattr(json_writer, "SPLIT_ABOVE", 1 << 40)
    cd.write_json(report, path, detail="full")
    assert not (tmp_path / "complydoc.parts" / "documents").exists()
