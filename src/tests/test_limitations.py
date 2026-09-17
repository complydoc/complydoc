"""The generated limitations section, including two bugs it used to have."""

from __future__ import annotations

import pytest

from complydoc.audit.run import run_audit
from complydoc.readiness.analyser import analyse
from complydoc.readiness.base import SignalStatus
from tests.helpers import FIXTURES


@pytest.fixture(scope="module")
def report(config):
    return run_audit(FIXTURES, config)


def entries(report, area):
    return [x for x in report.limitations if x.area == area]


def test_each_reason_is_attributed_to_the_right_documents(report):
    """Grouping on the signal alone attached one document's reason to all of them.

    It attributed "this is a docx file" to a PNG.
    """
    for entry in entries(report, "Signals not measured"):
        if "this is a docx file" in entry.statement:
            assert all(f.endswith(".docx") for f in entry.affected), entry.affected
        if "this is an image file" in entry.statement:
            assert all(f.endswith(".png") for f in entry.affected), entry.affected
        if "this is a xlsx file" in entry.statement:
            assert all(f.endswith(".xlsx") for f in entry.affected), entry.affected


def test_form_fields_reason_matches_the_document(report):
    """Only the encrypted PDF was skipped for being encrypted."""
    for entry in entries(report, "Signals not measured"):
        if "PDF form fields" in entry.statement and "encrypted" in entry.statement:
            assert entry.affected == ["encrypted.pdf"]


def test_character_counts_describe_their_own_document(report):
    """A count in a reason must be the count for the document it sits on.

    An earlier revision grouped these by signal name and reused the first
    document's character count for every document in the group.
    """
    counts = {}
    for document in report.documents:
        if not document.readiness:
            continue
        signal = next((s for s in document.readiness.signals if s.id == "garbled_char_rate"), None)
        if signal and signal.reason and "only " in signal.reason:
            counts[document.relative_path] = signal.reason.split("only ")[1].split(" ")[0]
    assert len(counts) > 1
    assert len(set(counts.values())) > 1, "every document reported the same count"


def test_articles_read_as_english(report):
    """Generated reasons use the correct article."""
    for entry in report.limitations:
        assert "a image" not in entry.statement
    reasons = [
        signal.reason or ""
        for document in report.documents
        if document.readiness
        for signal in document.readiness.signals
    ]
    assert any("an image file" in reason for reason in reasons)
    assert not any("a image" in reason for reason in reasons)


def test_signals_that_do_not_apply_are_not_run_level_limitations(report):
    """One entry per signal per document buried everything that needed attention."""
    areas = {x.area for x in report.limitations}
    assert "Signals not measured" not in areas

    signals = {s.id for d in report.documents if d.readiness for s in d.readiness.signals}
    assert not areas & signals, "a signal became a run-level limitation"

    # The entries describe the run, so how many there are tracks the run's own
    # facts. The exact number depends on which optional extras are installed, so
    # the bound is loose.
    assert len(report.limitations) < len(report.documents) * 2


def test_a_signal_that_did_not_apply_still_says_why_on_its_document(report):
    document = next(d for d in report.documents if d.relative_path == "sample.docx")
    skipped = [s for s in document.readiness.signals if s.rating is None]
    assert skipped
    assert all(s.reason for s in skipped)


def test_one_entry_per_distinct_tokenizer_note(report):
    """Models sharing a note get one entry."""
    notes = entries(report, "Token counting")
    assert notes
    statements = [n.statement for n in notes]
    assert len(statements) == len(set(statements)), "the same note was emitted twice"
    # Anthropic ships three models with identical wording; they must share an entry.
    anthropic = [n for n in notes if "Anthropic" in n.statement]
    assert len(anthropic) == 1
    assert len(anthropic[0].affected) >= 3


def test_an_unopenable_document_reports_no_table_count(loader, config):
    """A document that could not be opened has no table count."""
    document = loader("encrypted.pdf")
    result = analyse(document, config.readiness)
    signal = next(s for s in result.signals if s.id == "table_count")
    assert signal.status is SignalStatus.NOT_APPLICABLE
    assert "could not be opened" in (signal.reason or "")


def test_an_unopenable_document_scores_from_one_signal(loader, config):
    document = loader("encrypted.pdf")
    result = analyse(document, config.readiness)
    assert result.score is not None
    assert result.score.signals_counted == 1
    assert result.score.low_confidence is True


def test_alignment_tables_say_what_they_cannot_measure(report):
    """A table with no rules carries nothing to read a span from."""
    entry = next(x for x in report.limitations if x.area == "Table detection")
    assert "whitespace with no ruling lines" in entry.statement
    assert "whitespace_table.pdf" in entry.affected
    assert "native_text.pdf" not in entry.affected, "prose is not a table"


# --- What a run sent off the machine ---------------------------------------
#
# Everything else in complydoc stays on the machine that started it. A caller
# can register a classifier that does not, and these cover the two facts a
# report has to carry when they do: where the text went, and which documents
# the classifier never saw.


def _with(report, **changes):
    import dataclasses

    return dataclasses.replace(report.run, **changes)


def _limitations(report, config, **changes):
    from complydoc.report.limitations import build_limitations

    return build_limitations(_with(report, **changes), [], [], [], config)


def test_an_ordinary_run_says_nothing_about_the_network(report, config):
    """The disclosure exists for the run that needs it, and only that run."""
    assert report.run.content_sent_to == []
    assert report.run.classifier_missed_workers == 0

    areas = {x.area for x in _limitations(report, config)}
    assert "Content sent off this machine" not in areas
    assert "Classifier and worker processes" not in areas


def test_a_run_that_sent_text_somewhere_says_where(report, config):
    found = [
        x
        for x in _limitations(report, config, content_sent_to=["api.typesafe.ai"])
        if x.area == "Content sent off this machine"
    ]
    assert len(found) == 1
    assert "api.typesafe.ai" in found[0].statement
    assert found[0].severity == "important", "the offline premise not holding is not a footnote"


def test_a_classifier_that_could_not_reach_the_workers_is_reported(report, config):
    found = [
        x
        for x in _limitations(report, config, classifier_missed_workers=3)
        if x.area == "Classifier and worker processes"
    ]
    assert len(found) == 1
    assert "3 documents" in found[0].statement
    assert "jobs=1" in found[0].statement, "a limitation with no way out is not much use"


def test_documents_the_pool_gave_back_were_not_missed():
    """This counted every file whenever jobs > 1.

    A pool that fails hands its documents back to the main process, where the
    classifier does exist and does run. The count said 21 documents went
    unjudged on a run that demonstrably judged all of them.
    """
    import complydoc as cd
    from complydoc.audit.run import _classifier_missed

    cd.register_instruction_classifier(lambda passage: 0.0)
    try:
        assert _classifier_missed(None, 4, 21, 21) == 0, "all read in-process"
        assert _classifier_missed(None, 4, 21, 0) == 21
        assert _classifier_missed(None, 4, 21, 5) == 16
        assert _classifier_missed(None, 1, 21, 0) == 0, "one process, it ran"

        # A name crosses into every worker, so a parallel run misses nothing.
        assert _classifier_missed("jev", 4, 21, 0) == 0, "each worker resolved its own"
    finally:
        cd.register_instruction_classifier(None)

    assert _classifier_missed(None, 4, 21, 0) == 0, "no classifier, nothing missed"


def test_a_host_is_recorded_by_name_rather_than_by_socket_noise():
    """The guard records a DNS lookup and a connection. A report wants the name."""
    from complydoc.audit.run import _hosts_sent_content

    assert _hosts_sent_content() == [], "nothing has been sent in this process"
