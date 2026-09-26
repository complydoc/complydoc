"""Custom concepts: your own things to look for, found like any identifier."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from complydoc.audit.run import run_audit
from complydoc.cli import app
from complydoc.concepts import (
    CONCEPTS_FILENAME,
    Concept,
    ConceptError,
    ConceptFile,
    load_concepts,
    remove_concept,
    save_concept,
    with_concepts,
)

runner = CliRunner()

TARIFF = Concept(
    id="tariff_engine_id",
    label="Tariff engine ID",
    description="An identifier from our insurance tariff engine.",
    pattern=r"TE-\d{4}-\d{5}",
    severity="high",
)


def test_a_concept_needs_an_id_words_and_a_way_to_be_found():
    with pytest.raises(ValueError, match="not a concept id"):
        Concept(id="Tariff ID", label="x", description="y", pattern="x")
    with pytest.raises(ValueError, match="label and a description"):
        Concept(id="t", label=" ", description="y", pattern="x")
    with pytest.raises(ValueError, match="not a valid regular expression"):
        Concept(id="t", label="x", description="y", pattern="TE-(")
    with pytest.raises(ValueError, match="matches empty text"):
        Concept(id="t", label="x", description="y", pattern=r"\d*")
    with pytest.raises(ValueError, match="nothing would find it"):
        Concept(id="t", label="x", description="y")
    assert Concept(id="t", label="x", description="y", judge=True).pattern is None


def test_the_file_round_trips_and_saving_again_replaces(tmp_path):
    path = tmp_path / CONCEPTS_FILENAME
    assert load_concepts(path).concepts == []
    assert not save_concept(path, TARIFF)
    assert save_concept(path, TARIFF.model_copy(update={"severity": "medium"}))
    (concept,) = load_concepts(path).concepts
    assert concept.severity == "medium"
    assert remove_concept(path, "tariff_engine_id")
    assert not remove_concept(path, "tariff_engine_id")
    assert load_concepts(path).concepts == []


def test_ids_are_unique_in_a_file(tmp_path):
    path = tmp_path / CONCEPTS_FILENAME
    path.write_text(
        "concepts:\n"
        + "".join(f"  - {{id: t, label: x, description: y, pattern: 'a{n}'}}\n" for n in range(2))
    )
    with pytest.raises(ConceptError, match="repeated: t"):
        load_concepts(path)


def test_a_concept_with_a_pattern_becomes_a_category_and_changes_the_digest(config):
    changed = with_concepts(config, ConceptFile(concepts=[TARIFF]))
    category = changed.sensitive.categories["concept_tariff_engine_id"]
    assert (category.label, category.severity, category.patterns) == (
        "Tariff engine ID",
        "high",
        [TARIFF.pattern],
    )
    assert changed.digest != config.digest
    assert with_concepts(config, ConceptFile()) is config


def test_an_audit_finds_a_concept_like_any_identifier(tmp_path, config):
    folder = tmp_path / "policies"
    folder.mkdir()
    (folder / "quote.txt").write_text("Quote reference TE-2024-00012 applies to the renewal.\n")
    (folder / CONCEPTS_FILENAME).write_text(
        "concepts:\n  - id: tariff_engine_id\n    label: Tariff engine ID\n"
        "    description: An identifier from our tariff engine.\n"
        "    pattern: 'TE-\\d{4}-\\d{5}'\n    severity: high\n"
    )
    report = run_audit(folder, config, ("sensitive",), recurse=True, ocr=False)
    (document,) = report.documents
    (match,) = [m for m in document.sensitive.matches if m.category == "concept_tariff_engine_id"]
    assert match.label == "Tariff engine ID"
    assert match.severity == "high"
    assert "00012" not in match.masked or "•" in match.masked
    assert match.fingerprint.startswith("id-")
    assert report.concepts is not None
    assert [(c.id, c.found) for c in report.concepts.concepts] == [("tariff_engine_id", 1)]


def test_a_broken_concepts_file_stops_the_audit(tmp_path):
    folder = tmp_path / "docs"
    folder.mkdir()
    (folder / "a.txt").write_text("hello")
    bad = tmp_path / "concepts.yaml"
    bad.write_text("concepts:\n  - id: Bad\n    label: x\n    description: y\n")
    result = runner.invoke(
        app, ["audit", str(folder), "--concepts", str(bad), "--out", str(tmp_path / "out"), "-q"]
    )
    assert result.exit_code == 2
    assert "Cannot read the concepts file" in result.output


def test_the_report_says_which_concepts_it_looked_for(tmp_path, config):
    folder = tmp_path / "docs"
    folder.mkdir()
    (folder / "a.txt").write_text("nothing to see")
    file = tmp_path / "concepts.yaml"
    save_concept(file, TARIFF)
    out = tmp_path / "out"
    result = runner.invoke(
        app, ["audit", str(folder), "--concepts", str(file), "--out", str(out), "-q", "--no-ocr"]
    )
    assert result.exit_code == 0, result.output
    data = json.loads((out / "complydoc.json").read_text())
    assert data["concepts"]["file"] == str(file)
    assert data["concepts"]["concepts"][0]["found"] == 0


def _folder(tmp_path, concepts: str, pages: dict[str, str]) -> Path:
    folder = tmp_path / "policies"
    folder.mkdir()
    for name, text in pages.items():
        (folder / name).write_text(text)
    (folder / CONCEPTS_FILENAME).write_text(concepts)
    return folder


RENEWAL = (
    "concepts:\n  - id: renewal_quote\n    label: Renewal quote\n"
    "    description: A quote offering to renew an insurance policy.\n    judge: true\n"
)


def test_a_judge_finds_a_concept_no_pattern_could(tmp_path, config):
    folder = _folder(
        tmp_path,
        RENEWAL,
        {
            "a.txt": "We are pleased to offer renewal of your policy at 420 a year.",
            "b.txt": "Minutes.",
        },
    )
    asked: list[str] = []

    def judge(label: str, description: str, page: str) -> float:
        asked.append(label)
        return 0.9 if "renewal" in page else 0.1

    report = run_audit(folder, config, ("sensitive",), ocr=False, judge_concepts=judge)
    by_name = {d.relative_path: d for d in report.documents}
    (finding,) = by_name["a.txt"].concept_findings
    assert (finding.concept, finding.page, finding.score) == ("renewal_quote", 1, 0.9)
    assert by_name["b.txt"].concept_findings == []
    assert report.concepts is not None
    assert report.concepts.judge == "judge"
    assert [(c.id, c.judged) for c in report.concepts.concepts] == [("renewal_quote", 1)]
    assert asked == ["Renewal quote", "Renewal quote"]
    assert report.run.content_sent_to == []


def test_a_page_the_pattern_found_is_not_asked_again(tmp_path, config):
    both = (
        "concepts:\n  - id: tariff_engine_id\n    label: Tariff engine ID\n"
        "    description: An identifier from our tariff engine.\n"
        "    pattern: 'TE-\\d{4}-\\d{5}'\n    judge: true\n"
    )
    folder = _folder(
        tmp_path, both, {"a.txt": "Reference TE-2024-00012.", "b.txt": "No reference here."}
    )
    asked: list[str] = []

    def judge(label: str, description: str, page: str) -> float:
        asked.append(page)
        return 0.0

    run_audit(folder, config, ("sensitive",), ocr=False, judge_concepts=judge)
    assert asked == ["No reference here."]


def test_a_failed_question_is_counted_and_said_not_scored(tmp_path, config):
    folder = _folder(tmp_path, RENEWAL, {"a.txt": "Offer to renew."})

    def judge(label: str, description: str, page: str) -> float:
        raise ConnectionError("down")

    report = run_audit(folder, config, ("sensitive",), ocr=False, judge_concepts=judge)
    assert report.documents[0].concept_findings == []
    assert report.concepts is not None and report.concepts.unjudged == 1
    assert "Concept questions that failed" in {n.area for n in report.limitations}


def test_a_run_that_asks_no_judge_says_what_went_unlooked_for(tmp_path, config):
    folder = _folder(tmp_path, RENEWAL, {"a.txt": "Offer to renew."})
    report = run_audit(folder, config, ("sensitive",), ocr=False)
    (note,) = [n for n in report.limitations if n.area == "Concepts no model judged"]
    assert note.severity == "important"
    assert "Renewal quote, with no pattern, was not looked for at all" in note.statement


def test_jev_needs_its_key(monkeypatch):
    from complydoc.concepts import resolve_concept_judge

    for name in ("JEV_KEY", "TYPESAFE_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(ConceptError, match=r"cannot use the jev judge"):
        resolve_concept_judge("jev")
    with pytest.raises(ConceptError, match="no concept judge named 'gpt'"):
        resolve_concept_judge("gpt")
