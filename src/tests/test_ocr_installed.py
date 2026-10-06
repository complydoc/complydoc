"""Asking whether OCR is installed does not start the engine."""

from __future__ import annotations

import pytest

from complydoc.ingest import ocr
from complydoc.ingest.engines import rapidocr


def test_installed_is_answered_without_loading_the_models(monkeypatch: pytest.MonkeyPatch) -> None:
    def started() -> None:
        raise AssertionError("the engine was started to say whether it is installed")

    monkeypatch.setattr(rapidocr, "_pipeline", started)
    ocr.select("rapidocr")
    assert isinstance(ocr.installed(), bool)


def test_an_engine_with_no_cheaper_answer_is_asked_whether_it_is_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Plain:
        id = "plain"

        def available(self) -> bool:
            return True

    monkeypatch.setattr(ocr, "_engine", lambda: Plain())
    assert ocr.installed() is True
