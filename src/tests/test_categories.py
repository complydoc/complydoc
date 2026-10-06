"""Identifier categories switched off or re-graded in a file beside the documents."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from complydoc.audit.run import run_audit
from complydoc.categories import (
    CATEGORIES_FILENAME,
    CategoryChange,
    CategoryError,
    load_categories,
    reset_category,
    save_category,
    with_categories,
)
from complydoc.report.json_writer import to_dict


def test_a_change_sets_something():
    with pytest.raises(ValueError, match="enabled"):
        CategoryChange()


def test_the_file_keeps_only_what_differs_from_the_shipped_settings(tmp_path, config):
    path = tmp_path / CATEGORIES_FILENAME
    shipped = config.sensitive.categories["us_zip_code"]
    assert shipped.enabled
    save_category(path, "us_zip_code", CategoryChange(enabled=False), config)
    assert load_categories(path).categories["us_zip_code"].enabled is False
    # Saying it is on again is the shipped setting, so nothing is left to keep.
    save_category(path, "us_zip_code", CategoryChange(enabled=True), config)
    assert load_categories(path).categories == {}
    save_category(path, "organisation_name", CategoryChange(severity="high"), config)
    save_category(path, "organisation_name", CategoryChange(enabled=False), config)
    kept = load_categories(path).categories["organisation_name"]
    assert (kept.enabled, kept.severity) == (False, "high")
    assert reset_category(path, "organisation_name")
    assert not reset_category(path, "organisation_name")


def test_a_category_that_does_not_exist_cannot_be_saved(tmp_path, config):
    with pytest.raises(CategoryError, match="not an identifier category"):
        save_category(tmp_path / CATEGORIES_FILENAME, "nope", CategoryChange(enabled=False), config)


def test_a_broken_file_says_where(tmp_path):
    path = tmp_path / CATEGORIES_FILENAME
    path.write_text("categories:\n  iban:\n    colour: red\n")
    with pytest.raises(CategoryError, match=CATEGORIES_FILENAME):
        load_categories(path)


def test_changes_are_made_and_the_run_is_not_the_same_run(tmp_path, config):
    path = tmp_path / CATEGORIES_FILENAME
    save_category(path, "email_address", CategoryChange(enabled=False, severity="low"), config)
    path.write_text(path.read_text() + "  not_a_category:\n    enabled: false\n")
    changed, applied = with_categories(config, load_categories(path))
    email = changed.sensitive.categories["email_address"]
    # Switched off is silent, not gone: still looked for, so the report can mask it.
    assert (email.enabled, email.silent, email.severity) == (True, True, "low")
    assert not config.sensitive.categories["email_address"].silent
    assert applied.unknown == ["not_a_category"]
    assert changed.digest != config.digest
    assert with_categories(config, load_categories(tmp_path / "absent.yaml"))[0] is config


def _folder(tmp_path: Path, categories: str | None) -> Path:
    folder = tmp_path / "docs"
    folder.mkdir()
    (folder / "note.txt").write_text("Write to ana.silva@example.com about the renewal.\n")
    if categories is not None:
        (folder / CATEGORIES_FILENAME).write_text(categories)
    return folder


def test_a_switched_off_category_finds_nothing_and_the_report_says_it_was_not_looked_for(
    tmp_path, config
):
    folder = _folder(tmp_path, "categories:\n  email_address:\n    enabled: false\n")
    report = run_audit(folder, config, ("sensitive",), ocr=False)
    (document,) = report.documents
    assert "email_address" not in {m.category for m in document.sensitive.matches}
    assert report.categories is not None
    (change,) = report.categories.changes
    assert (change.category, change.enabled, change.shipped_enabled) == (
        "email_address",
        False,
        True,
    )
    off = [item for item in report.limitations if item.area == "Categories switched off"]
    assert len(off) == 1 and "Email address" in off[0].statement
    assert off[0].severity == "important"
    # Reported nowhere: no count, and no word that it could not be scanned.
    assert "email_address" not in report.aggregate.sensitive_by_category
    assert not [u for u in document.sensitive.unscanned_categories if u.category == "email_address"]


def test_a_switched_off_category_is_still_masked_in_the_reports_text(tmp_path, config):
    folder = _folder(tmp_path, "categories:\n  email_address:\n    enabled: false\n")
    report = run_audit(folder, config, ("sensitive",), ocr=False, extracted_text=True)
    (document,) = report.documents
    text = "\n".join(page.masked_text or page.text for page in document.extracted_text)
    assert "renewal" in text
    assert "ana.silva@example.com" not in text
    assert "example.com" not in json.dumps(to_dict(report, detail="full"))


def test_a_silent_find_never_takes_a_reported_ones_place(config):
    from complydoc.sensitive.scanner import scan_text

    text = "Card 4111 1111 1111 1111 for ana.silva@example.com"
    shipped, _ = scan_text(text, config.sensitive)
    quiet = config.sensitive.model_copy(
        update={
            "categories": {
                **config.sensitive.categories,
                "email_address": config.sensitive.categories["email_address"].model_copy(
                    update={"silent": True}
                ),
            }
        }
    )
    reported, _ = scan_text(text, quiet)
    covered, _ = scan_text(text, quiet, masking=True)
    assert [m.category for m in reported] == [
        m.category for m in shipped if m.category != "email_address"
    ]
    assert {m.category for m in covered} == {m.category for m in shipped}


def test_a_regraded_category_is_found_at_its_new_severity(tmp_path, config):
    folder = _folder(tmp_path, "categories:\n  email_address:\n    severity: high\n")
    report = run_audit(folder, config, ("sensitive",), ocr=False)
    (document,) = report.documents
    (match,) = [m for m in document.sensitive.matches if m.category == "email_address"]
    assert match.severity == "high"
    assert not [i for i in report.limitations if i.area == "Categories switched off"]


def test_a_name_that_is_no_category_is_said_and_does_not_stop_the_run(tmp_path, config):
    folder = _folder(tmp_path, "categories:\n  emial_address:\n    enabled: false\n")
    report = run_audit(folder, config, ("sensitive",), ocr=False)
    assert report.categories is not None and report.categories.unknown == ["emial_address"]
    assert any("emial_address" in item.statement for item in report.limitations)


def test_a_run_without_the_file_records_none(tmp_path, config):
    report = run_audit(_folder(tmp_path, None), config, ("sensitive",), ocr=False)
    assert report.categories is None
