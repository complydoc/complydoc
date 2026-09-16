"""Names from a token-classification model.

The model is an optional extra, so everything that needs it is skipped without
it. What does not need it is checked everywhere: a page is cut into windows
before it reaches a model that reads a few hundred tokens at a time, and a
window that lost track of its offset would report a name at the wrong place.
"""

from __future__ import annotations

import importlib.util

import pytest

from complydoc.sensitive.detectors.token_classifier import (
    TokenClassifierDetector,
    _windows,
    configured_models,
    model_available,
)
from complydoc.sensitive.registry import detector_by_id

MODEL = "Babelscape/wikineural-multilingual-ner"

requires_model = pytest.mark.skipif(
    importlib.util.find_spec("transformers") is None or not model_available(MODEL)[0],
    reason="the multilingual-names extra and a local copy of the model are not installed",
)


def test_the_detector_is_registered():
    """Pointing a category at it in YAML has to find it by name."""
    assert detector_by_id(TokenClassifierDetector.id) is not None


def test_a_short_page_is_one_window():
    text = "Signed by Jane Doe.\n"
    assert _windows(text) == [(0, text)]


def test_a_long_page_is_cut_into_windows_that_still_know_where_they_are():
    page = "\n".join(f"Line {index}: some contract text." for index in range(400))
    pieces = _windows(page)

    assert len(pieces) > 1, "a page this long has to be read in pieces"
    assert "".join(text for _, text in pieces) == page, "no text may be dropped"
    for offset, text in pieces:
        assert page[offset : offset + len(text)] == text, "an offset that slipped"


def test_windows_are_cut_at_line_boundaries():
    """An entity split across two windows is lost, so the cut goes where one ends."""
    page = "\n".join(f"Line {index}: some contract text." for index in range(400))
    for _, text in _windows(page)[:-1]:
        assert text.endswith("\n")


def test_no_model_is_configured_by_default(config):
    """The shipped configuration uses spaCy; this detector is opt in."""
    assert configured_models(config.sensitive) == []


@requires_model
def test_it_finds_names_in_a_language_the_shipped_model_does_not_read(config):
    from complydoc.sensitive.scanner import scan_text

    settings = config.override(
        {
            "sensitive.categories.person_name.detector": "token_classifier",
            "sensitive.categories.person_name.model.name": MODEL,
            "sensitive.categories.person_name.model.entity_labels": ["PER"],
        }
    )
    text = "O contrato foi assinado por Maria Ferreira em Lisboa.\n"
    matches, unavailable = scan_text(text, settings.sensitive)

    assert not unavailable
    found = [m for m in matches if m.category == "person_name"]
    assert found, "the Portuguese name should be found"
    assert found[0].confidence is not None, "a score the confidence floor can read"
    assert found[0].evidence == "model"


@requires_model
def test_a_name_past_the_token_ceiling_is_still_found(config):
    """What the windows are for: a model reads a few hundred tokens at a time."""
    from complydoc.sensitive.scanner import scan_text

    settings = config.override(
        {
            "sensitive.categories.person_name.detector": "token_classifier",
            "sensitive.categories.person_name.model.name": MODEL,
            "sensitive.categories.person_name.model.entity_labels": ["PER"],
        }
    )
    filler = "\n".join(
        f"Line {index}: routine text with nothing of interest." for index in range(60)
    )
    page = f"{filler}\nThe final signatory is Giulia Bianchi.\n"
    matches, _ = scan_text(page, settings.sensitive)

    assert [m for m in matches if m.category == "person_name"], (
        "a name after the first few hundred tokens was missed"
    )


def test_a_missing_model_is_reported_rather_than_downloaded():
    """A scan runs inside the network guard, so nothing is fetched to fix this.

    There are two ways to be unavailable and each has its own thing to say: the
    extra is not installed, or it is and the model is not on the machine. Which
    exception the library raises for a model it cannot find varies, so what is
    checked is that the reason tells the reader what to do about it.
    """
    ok, reason = model_available("complydoc/no-such-model-exists")

    assert not ok
    assert reason
    if importlib.util.find_spec("transformers") is None:
        assert "multilingual-names" in reason, "say which extra is missing"
    else:
        assert "complydoc/no-such-model-exists" in reason, "say which model to fetch"


def test_the_offline_switch_is_set_before_the_library_is_imported(tmp_path):
    """The bug this guards: a scan reached the hub and the guard stopped it.

    `huggingface_hub` reads its offline setting once, as it is imported, so a
    value set afterwards is never seen. The weights come from the cache either
    way; what went to the network was the tokenizer asking for its templates.

    It has to be a fresh process. By the time this suite reaches here another
    test may have imported the library already, and then the ordering under
    test no longer happens.
    """
    import subprocess
    import sys

    script = """
import sys
from complydoc import offline
from complydoc.sensitive.detectors.token_classifier import model_available

offline.arm()                      # armed first, exactly as an audit does
assert "transformers" not in sys.modules, "the library must not be imported yet"
ok, reason = model_available("Babelscape/wikineural-multilingual-ner")
print("OK" if ok else f"FAILED {reason}")
"""
    import os

    # The real HOME: the model cache lives under it, and a fresh HOME would
    # hide the weights and pass this test for the wrong reason.
    environment = dict(os.environ)
    environment["PYTHONPATH"] = ":".join(sys.path)
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        cwd=str(tmp_path),
        env=environment,
    )
    if "FAILED" in result.stdout and "not on this machine" in result.stdout:
        pytest.skip("the model is not on this machine")
    assert "OK" in result.stdout, f"{result.stdout}\n{result.stderr[-2000:]}"
