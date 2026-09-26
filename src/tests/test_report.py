"""Reports: the JSON, the generated limitations, and the no-leak guarantee."""

from __future__ import annotations

import json

import pytest

from complydoc.audit.run import COMPONENTS, run_audit
from complydoc.report.json_writer import to_dict, write_json
from tests.helpers import FIXTURES

SECRETS = (
    "4111 1111 1111 1111",
    "4111111111111111",
    "AB123456C",
    "jane.doe@example.com",
    "GB82 WEST 1234 5698 7654 32",
    "GB123456782",
    "020 7946 0958",
)


@pytest.fixture(scope="module")
def report(config):
    # Inside the guard, as the command line and the Python API run an audit, so the
    # report records it whichever tests ran before.
    from complydoc import offline

    with offline.guarded():
        return run_audit(FIXTURES, config, COMPONENTS, monthly_volume=1000)


# --- the guarantee ---------------------------------------------------------


def test_no_sensitive_value_reaches_the_json_by_default(report):
    serialised = json.dumps(to_dict(report))
    for secret in SECRETS:
        assert secret not in serialised, f"{secret!r} leaked into the JSON report"


def test_no_sensitive_value_reaches_the_page_pictures(config):
    """With every field written and the pages pictured, the boxes still carry masked values only."""
    pictured = run_audit(FIXTURES, config, COMPONENTS, page_images=True)
    data = json.dumps(to_dict(pictured, detail="full"))
    for secret in SECRETS:
        assert secret not in data, f"{secret!r} leaked into the page previews"


def test_reveal_is_recorded_and_stamped(config):
    revealed = run_audit(FIXTURES, config, ("sensitive",), reveal=True)
    assert revealed.run.reveal_used is True
    assert any(x.area == "Masking" for x in revealed.limitations)


def test_never_reveal_categories_stay_masked_even_then(config):
    revealed = json.dumps(to_dict(run_audit(FIXTURES, config, ("sensitive",), reveal=True)))
    assert "4111111111111111" not in revealed
    assert "AB123456C" not in revealed


# --- content ---------------------------------------------------------------


def test_skipped_files_are_reported_not_silently_dropped(report):
    names = {s.path.name for s in report.skipped}
    assert "broken.pdf" in names
    assert "notes.rtf" in names


# --- limitations -----------------------------------------------------------


def test_limitations_are_generated_from_this_run(report):
    areas = {x.area for x in report.limitations}
    assert "Files not examined" in areas
    assert "Pages that could not be read" in areas
    assert "Encrypted documents" in areas
    assert "Table detection" in areas


def test_limitations_name_the_documents_they_apply_to(report):
    entry = next(x for x in report.limitations if x.area == "Encrypted documents")
    assert entry.affected == ["encrypted.pdf"]


def test_running_one_component_says_so_in_the_limitations(config):
    only_sensitive = run_audit(FIXTURES, config, ("sensitive",))
    entry = next(x for x in only_sensitive.limitations if x.area == "Components not run")
    assert "cost" in entry.statement and "readiness" in entry.statement


def test_a_run_with_everything_available_does_not_claim_missing_components(report):
    assert not any(x.area == "Components not run" for x in report.limitations)


def test_output_cost_is_declared_out_of_scope(report):
    entry = next(x for x in report.limitations if x.area == "Cost scope")
    assert "Only input cost" in entry.statement


def test_extrapolation_states_its_assumption(report):
    entry = next(x for x in report.limitations if x.area == "Volume extrapolation")
    assert entry.severity == "important"


# --- machine readable ------------------------------------------------------


def test_json_round_trips(report, tmp_path):
    path = write_json(report, tmp_path / "r.json")
    data = json.loads(path.read_text())
    assert data["run"]["schema_version"] == report.run.schema_version
    assert len(data["documents"]) == len(report.documents)
    assert "limitations" in data


def test_json_is_stable_for_diffing(report, tmp_path):
    first = write_json(report, tmp_path / "a.json").read_text()
    second = write_json(report, tmp_path / "b.json").read_text()
    assert first == second


def test_config_digest_is_recorded_so_runs_are_comparable(report, config):
    assert report.run.config_digest == config.digest


def test_offline_status_is_recorded(report):
    assert report.run.offline_guard in {"armed", "not_armed"}


# --- opt-in page images ----------------------------------------------------


def test_default_report_embeds_no_page_images(report):
    assert report.run.page_images_used is False
    assert "data:image/jpeg" not in json.dumps(to_dict(report))


def test_page_images_are_recorded_in_the_run_options(config):
    """--page-images is recorded in the run options, and the pictures are in the report."""
    with_images = run_audit(FIXTURES, config, COMPONENTS, page_images=True)
    assert with_images.run.page_images_used is True
    assert "data:image/jpeg" in json.dumps(to_dict(with_images))


# --- opt-in extracted text -------------------------------------------------


def test_extracted_text_is_absent_by_default(report):
    assert report.run.extracted_text_used is False
    assert all(not d.extracted_text for d in report.documents)


def test_extracted_text_is_included_and_stamped_when_asked_for(config):
    with_text = run_audit(FIXTURES, config, COMPONENTS, extracted_text=True)
    assert with_text.run.extracted_text_used is True
    document = next(d for d in with_text.documents if d.relative_path == "sensitive_sample.pdf")
    assert document.extracted_text
    assert "EMPLOYEE RECORD" in document.extracted_text[0].text


def test_extracted_text_records_how_each_page_was_read(config):
    with_text = run_audit(FIXTURES, config, COMPONENTS, extracted_text=True)
    scanned = next(d for d in with_text.documents if d.relative_path == "scanned_page.pdf")
    assert scanned.extracted_text[0].source == "none"
    assert scanned.extracted_text[0].characters == 0


def test_very_long_pages_are_truncated_not_dropped(config):
    """One enormous document must not make the report unopenable."""
    from complydoc.audit.run import _MAX_TEXT_CHARS

    with_text = run_audit(FIXTURES, config, COMPONENTS, extracted_text=True)
    for document in with_text.documents:
        for page in document.extracted_text:
            assert len(page.text) <= _MAX_TEXT_CHARS
            if page.truncated:
                assert page.characters > _MAX_TEXT_CHARS


# --- signals ---------------------------------------------------------------


def test_signal_explanations_are_one_sentence(config):
    """The brief asks for one plain sentence, and prose is what buries a table."""
    from complydoc.readiness.registry import all_signals

    for signal in all_signals():
        assert signal.why.count(".") <= 1, f"{signal.id} runs to more than one sentence"
        assert len(signal.why) <= 100, f"{signal.id} is {len(signal.why)} characters"


# --- run options -----------------------------------------------------------


def test_run_options_record_exactly_what_was_asked_for(config):
    report = run_audit(FIXTURES, config, COMPONENTS, ocr=False, monthly_volume=500)
    assert report.run.ocr_requested is False
    assert report.run.monthly_volume == 500
    assert report.run.page_images_used is False
    assert report.run.reveal_used is False
