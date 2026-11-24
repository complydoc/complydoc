"""A reviewer sees a page's findings together and returns the ones to report."""

from __future__ import annotations

import pytest

from complydoc.config.loader import load_config
from complydoc.sensitive import review
from complydoc.sensitive.review import Reviewed
from complydoc.sensitive.scanner import scan_text

TEXT = "Contact maria@example.com about the lease.\nReference 7781-22.\n"

seen: list[list[Reviewed]] = []


def keep_and_add(text: str, found: list[Reviewed]) -> list[Reviewed]:
    seen.append(found)
    start = text.index("7781-22")
    kept = [Reviewed(f.start, f.end, f.category, 0.97) for f in found]
    return [
        *kept,
        Reviewed(start, start + 7, "bank_account_number", 0.6),
        Reviewed(0, 7, "no_such_category", 0.9),
    ]


def drop_all(text: str, found: list[Reviewed]) -> list[Reviewed]:
    return []


def broken(text: str, found: list[Reviewed]) -> list[Reviewed]:
    raise RuntimeError("model fell over")


def _config(path: str | None):
    sensitive = load_config().sensitive
    return sensitive.model_copy(update={"review": path})


def test_without_a_reviewer_the_detectors_answer() -> None:
    matches, _ = scan_text(TEXT, _config(None))
    assert [m.category for m in matches] == ["email_address"]


def test_reviewer_rescores_and_adds() -> None:
    seen.clear()
    matches, _ = scan_text(TEXT, _config(f"{__name__}:keep_and_add"))
    assert [f.category for f in seen[0]] == ["email_address"]
    assert seen[0][0].evidence is not None
    by_category = {m.category: m for m in matches}
    assert set(by_category) == {"email_address", "bank_account_number"}
    assert by_category["email_address"].confidence == 0.97
    added = by_category["bank_account_number"]
    assert (added.line, added.column, added.length) == (2, 10, 7)
    assert added.evidence == "model"


def test_reviewer_can_drop_everything() -> None:
    matches, _ = scan_text(TEXT, _config(f"{__name__}:drop_all"))
    assert matches == []


def test_a_broken_reviewer_leaves_the_page_as_found(capsys: pytest.CaptureFixture[str]) -> None:
    review._said.clear()
    matches, _ = scan_text(TEXT, _config(f"{__name__}:broken"))
    assert [m.category for m in matches] == ["email_address"]
    assert "not used: RuntimeError: model fell over" in capsys.readouterr().err


def test_a_reviewer_that_does_not_import_is_passed_over(capsys: pytest.CaptureFixture[str]) -> None:
    review._said.clear()
    matches, _ = scan_text(TEXT, _config("no_such_module_here:review"))
    assert [m.category for m in matches] == ["email_address"]
    assert "no_such_module_here" in capsys.readouterr().err
