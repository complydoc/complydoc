"""`complydoc assist`, and what it sends.

The model call itself is never made here: the tests stand in for it. What is
checked is everything around it: that the report leaves only when the caller
asked for it, that the parts held back are held back, and that the command
reports a failure rather than raising.
"""

from __future__ import annotations

import json

import pytest
from typer.testing import CliRunner

import complydoc as cd
from complydoc.cli import app
from complydoc.integrations.assistant import report_payload
from complydoc.integrations.assistant.agent import quick_wins_call
from complydoc.integrations.assistant.schema import AssistantMessage, QuickWin
from tests.helpers import FIXTURES

runner = CliRunner()


@pytest.fixture(scope="module")
def report(config):
    return cd.full_audit(
        FIXTURES / "sensitive_sample.pdf",
        config=config,
        ocr=False,
        extracted_text=True,
        page_images=True,
    )


@pytest.fixture
def written(report, tmp_path):
    return cd.write_json(report, tmp_path / "report.json")


def test_the_report_only_leaves_when_the_caller_says_so(report):
    """The default is refusal, so no caller sends a report by omission."""
    with pytest.raises(ValueError, match="allow_network=True"):
        quick_wins_call(report)


def test_the_page_text_and_pictures_are_held_back(report):
    sent = json.loads(report_payload(report))
    document = sent["documents"][0]
    assert "previews" not in document and "extracted_text" not in document
    assert "base64" not in report_payload(report)
    # The price list crossed with the folder, which was most of the payload.
    assert "models" not in document["cost"]
    assert "documents" not in sent["cost"]


def test_what_a_quick_win_rests_on_is_still_sent(report):
    sent = json.loads(report_payload(report))
    document = sent["documents"][0]
    assert document["readiness"]["signals"], "the signals are the advice"
    assert document["routing"] and document["sensitive"]
    assert sent["aggregate"]["total_text_path_usd"] is not None, "cost totals survive"
    assert sent["limitations"] and sent["run"]["offline_guard"]


def test_holding_back_does_not_touch_the_report(report):
    """The caller's report is theirs; the payload is a copy."""
    report_payload(report)
    assert report.documents[0].previews, "still there for whoever asked for it"
    assert report.documents[0].extracted_text


def test_the_command_prints_the_drafted_wins(monkeypatch, written):
    def answer(report, *, allow_network=False, model=""):
        assert allow_network is True, "the command is the caller that says so"
        return AssistantMessage(
            quick_wins=[QuickWin(quick_win="Turn on OCR", justification="A page was unread")]
        )

    monkeypatch.setattr("complydoc.integrations.assistant.quick_wins_call", answer)
    result = runner.invoke(app, ["assist", "--report", str(written)])
    assert result.exit_code == 0, result.output
    assert "Turn on OCR" in result.output


def test_the_command_says_where_the_report_went(monkeypatch, written):
    monkeypatch.setattr(
        "complydoc.integrations.assistant.quick_wins_call",
        lambda report, **kw: AssistantMessage(quick_wins=[]),
    )
    result = runner.invoke(app, ["assist", "--report", str(written), "--model", "some-model"])
    assert result.exit_code == 0
    assert "some-model" in result.output, "the model is named before the report is sent"


def test_a_failed_model_call_is_reported_not_raised(monkeypatch, written):
    def fail(report, **kw):
        raise RuntimeError("401 unauthorised")

    monkeypatch.setattr("complydoc.integrations.assistant.quick_wins_call", fail)
    result = runner.invoke(app, ["assist", "--report", str(written)])
    assert result.exit_code == 2
    assert "401 unauthorised" in result.output
    assert "Traceback" not in result.output


def test_an_unreadable_report_exits_two(tmp_path):
    result = runner.invoke(app, ["assist", "--report", str(tmp_path / "nothing.json")])
    assert result.exit_code == 2
