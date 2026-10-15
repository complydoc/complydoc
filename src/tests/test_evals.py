"""Evals on your own documents: the folder's expected passages, checked against every reading."""

from __future__ import annotations

import http.client
import json
import shutil
from pathlib import Path

import pytest
from pypdf import PdfReader
from typer.testing import CliRunner

import complydoc as cd
from complydoc import offline
from complydoc.cli import app
from complydoc.evals import (
    EVALS_FILENAME,
    EvalError,
    ExpectedFact,
    add_fact,
    find_evals_file,
    load_evals,
    remove_fact,
)
from complydoc.report.json_reader import load_report
from complydoc.viewer import launch_ui

runner = CliRunner()
SAMPLE = Path(__file__).parents[1] / "complydoc" / "sample" / "terms-and-conditions.pdf"

KEPT = "Invoices are payable within fourteen days of the invoice date"
LOST = "Title in any goods supplied passes on receipt of payment in full"
NOWHERE = "The supplier indemnifies the customer against all third party claims"


@pytest.fixture
def folder(tmp_path: Path) -> Path:
    documents = tmp_path / "contracts"
    documents.mkdir()
    shutil.copy(SAMPLE, documents / "terms.pdf")
    return documents


def test_a_fact_is_added_once_tidied_and_taken_out(folder: Path):
    file = folder / EVALS_FILENAME
    assert find_evals_file(folder) is None and load_evals(file).facts == []

    assert add_fact(file, ExpectedFact(text=f"  {KEPT}\n", document="terms.pdf"))
    assert not add_fact(file, ExpectedFact(text=KEPT.upper(), document="terms.pdf"))
    assert add_fact(file, ExpectedFact(text=LOST))
    assert find_evals_file(folder) == file
    assert [(f.text, f.document) for f in load_evals(file).facts] == [
        (KEPT, "terms.pdf"),
        (LOST, None),
    ]
    assert file.read_text().startswith("# Passages a reading of these documents must contain.")

    assert not remove_fact(file, KEPT)  # not without its document
    assert remove_fact(file, KEPT, "terms.pdf")
    assert [f.text for f in load_evals(file).facts] == [LOST]


def test_a_fact_too_short_to_mean_anything_and_a_broken_file_are_refused(folder: Path):
    with pytest.raises(ValueError):
        ExpectedFact(text=" a ")
    (folder / EVALS_FILENAME).write_text("facts: [oops")
    with pytest.raises(EvalError, match="not valid YAML"):
        load_evals(folder / EVALS_FILENAME)
    (folder / EVALS_FILENAME).write_text("facts:\n  - passage: wrong key\n")
    with pytest.raises(EvalError, match="not a valid evals file"):
        load_evals(folder / EVALS_FILENAME)


def test_an_audit_checks_the_folders_evals_against_its_own_reading(folder: Path, tmp_path: Path):
    """A passage the page has is found on its page; one it words differently is missed,
    and the miss comes with the nearest thing the reading does hold."""
    wrong = "Invoices are payable in advance, by direct debit on the first day of each month"
    add_fact(
        folder / EVALS_FILENAME, ExpectedFact(text="Terms and conditions", document="terms.pdf")
    )
    add_fact(folder / EVALS_FILENAME, ExpectedFact(text=wrong, document="terms.pdf"))
    out = tmp_path / "out"
    result = runner.invoke(app, ["audit", str(folder), "--out", str(out), "--no-ocr", "-q"])
    assert result.exit_code == 0, result.output

    written = json.loads((out / "complydoc.json").read_text())["evals"]
    assert written["file"].endswith(EVALS_FILENAME)
    (reader,) = written["readers"]
    heading, clause = written["checks"]
    assert heading["found"][reader] == "exact" and heading["pages"][reader] == 1
    assert clause["fact"] == wrong and clause["found"][reader] is None
    assert "Invoices are payable" in clause["nearest"][reader]


def test_an_audit_scores_every_reader_it_kept_the_text_of(folder: Path):
    """Read a second way with the text kept, the folder's facts are scored on both readers."""
    import complydoc as cd

    add_fact(
        folder / EVALS_FILENAME, ExpectedFact(text="Terms and conditions", document="terms.pdf")
    )
    report = cd.full_audit(folder, compare_extractors=["pypdf"], extracted_text=True, ocr=False)
    assert report.evals is not None
    assert report.evals.readers == [report.run.extractor, "pypdf"]
    (check,) = report.evals.checks
    assert set(check.found) == set(report.evals.readers)


def test_an_audit_says_in_the_terminal_how_the_reader_did(folder: Path, tmp_path: Path):
    add_fact(
        folder / EVALS_FILENAME, ExpectedFact(text="Terms and conditions", document="terms.pdf")
    )
    add_fact(folder / EVALS_FILENAME, ExpectedFact(text="Payment is due within ninety days"))
    said = runner.invoke(app, ["audit", str(folder), "--out", str(tmp_path / "a"), "--no-ocr"])
    assert "1 of 2 expected passages kept, 1 lost" in " ".join(said.output.split())
    bare = runner.invoke(
        app, ["audit", str(folder), "--out", str(tmp_path / "b"), "--no-ocr", "--no-extracted-text"]
    )
    assert "was not checked" in " ".join(bare.output.split())


def test_a_broken_evals_file_does_not_lose_the_run(folder: Path, tmp_path: Path):
    """The file is read after every document has been: the run is kept and says what is wrong."""
    (folder / EVALS_FILENAME).write_text("facts: [oops")
    out = tmp_path / "out"
    result = runner.invoke(app, ["audit", str(folder), "--out", str(out), "--no-ocr"])
    assert result.exit_code == 0, result.output
    assert "could not be read" in " ".join(result.output.split())
    written = json.loads((out / "complydoc.json").read_text())["evals"]
    assert written["checks"] == [] and "not valid YAML" in written["error"]


def test_an_evals_file_that_expects_nothing_says_so(folder: Path, tmp_path: Path):
    (folder / EVALS_FILENAME).write_text("schema_version: 1\nfacts: []\n")
    said = runner.invoke(app, ["audit", str(folder), "--out", str(tmp_path / "a"), "--no-ocr"])
    said = " ".join(said.output.split())
    assert "it expects nothing yet" in said and "--extracted-text" not in said


def test_a_second_reader_is_never_scored_on_the_first_readers_text(folder: Path):
    """Where a second reader read nothing of a page, it has no text there to find a fact in."""
    import dataclasses

    import complydoc as cd
    from complydoc.evals import _as_read_by

    report = cd.full_audit(folder, compare_extractors=["pypdf"], extracted_text=True, ocr=False)
    (document,) = report.documents
    bare = dataclasses.replace(
        document,
        extracted_text=[
            dataclasses.replace(
                page, readings={k: v for k, v in page.readings.items() if k != "pypdf"}
            )
            for page in document.extracted_text
        ],
    )
    assert all(page.text == "" for page in _as_read_by(bare, "pypdf", False).extracted_text)
    assert all(page.text for page in _as_read_by(bare, report.run.extractor, True).extracted_text)


def test_the_viewer_answers_a_request_with_a_negative_length(folder: Path, tmp_path: Path):
    """A length below zero used to be read as "until the connection closes", which never came."""
    out = tmp_path / "out"
    runner.invoke(app, ["audit", str(folder), "--out", str(out), "--no-ocr", "-q"])
    offline.disarm()
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><head></head><body></body></html>")
    viewer = launch_ui(out, port=0, open_browser=False, dist=dist)
    try:
        (report,) = viewer.reports()
        connection = http.client.HTTPConnection("127.0.0.1", viewer.port, timeout=5)
        connection.putrequest("POST", f"/api/reports/{report.id}/evals")
        connection.putheader("Content-Type", "application/json")
        connection.putheader("Origin", f"http://127.0.0.1:{viewer.port}")
        connection.putheader("Content-Length", "-1")
        connection.endheaders()
        assert connection.getresponse().status == 400
        connection.close()
    finally:
        viewer.stop()


def test_a_folder_with_no_evals_file_has_none(folder: Path, tmp_path: Path):
    out = tmp_path / "out"
    assert (
        runner.invoke(app, ["audit", str(folder), "--out", str(out), "--no-ocr", "-q"]).exit_code
        == 0
    )
    assert json.loads((out / "complydoc.json").read_text())["evals"] is None


class Page:
    def __init__(self, text: str, source: str, number: int) -> None:
        self.page_content = text
        self.metadata = {"source": source, "page": number}


class Whole:
    """A loader that returns the page as the file writes it."""

    def __init__(self, path: str) -> None:
        self.path = path

    def load(self) -> list[Page]:
        pages = PdfReader(self.path).pages
        return [Page(page.extract_text(), self.path, number) for number, page in enumerate(pages)]


class DropsAClause(Whole):
    """A loader that loses a line, as a reading of a two-column page can."""

    def load(self) -> list[Page]:
        return [
            Page(
                page.page_content.replace("passes on receipt of payment in", ""), self.path, number
            )
            for number, page in enumerate(super().load())
        ]


def test_a_loader_comparison_scores_every_loader_on_the_folders_evals(folder: Path):
    for text in (KEPT, LOST, NOWHERE):
        add_fact(folder / EVALS_FILENAME, ExpectedFact(text=text))
    report = cd.compare_loaders({"whole": Whole, "drops": DropsAClause}, paths=folder)

    assert report.evals is not None
    assert report.evals.readers == ["whole", "drops"]
    kept, lost, nowhere = report.evals.checks
    assert (kept.found["whole"], kept.found["drops"]) == ("exact", "exact")
    assert lost.found["whole"] == "exact" and lost.found["drops"] != "exact"
    assert lost.nearest["drops"]  # what the miss looks like in that loader's text
    assert nowhere.found == {"whole": None, "drops": None}
    # The same checks the comparison ranks its loaders by.
    assert report.loader_comparison is not None
    assert report.loader_comparison.facts == report.evals.checks
    assert report.loader_comparison.ranked[0] == "whole"


def test_facts_given_outright_are_used_in_place_of_the_file(folder: Path):
    add_fact(folder / EVALS_FILENAME, ExpectedFact(text=NOWHERE))
    report = cd.compare_loaders({"whole": Whole, "drops": DropsAClause}, paths=folder, facts=[KEPT])
    assert report.evals is None
    assert report.loader_comparison is not None
    assert [check.fact for check in report.loader_comparison.facts] == [KEPT]


def send(port: int, method: str, path: str, body: object | None = None) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    headers = {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{port}"}
    connection.request(
        method, path, body=json.dumps(body) if body is not None else None, headers=headers
    )
    response = connection.getresponse()
    data = response.read()
    connection.close()
    return response.status, data


def test_the_viewer_lists_adds_and_removes_the_folders_facts(folder: Path, tmp_path: Path):
    out = tmp_path / "out"
    assert (
        runner.invoke(app, ["audit", str(folder), "--out", str(out), "--no-ocr", "-q"]).exit_code
        == 0
    )
    offline.disarm()
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><head></head><body></body></html>")
    viewer = launch_ui(out, port=0, open_browser=False, dist=dist)
    try:
        (report,) = viewer.reports()
        url = f"/api/reports/{report.id}/evals"
        status, body = send(viewer.port, "GET", url)
        assert status == 200 and json.loads(body)["facts"] == []

        status, body = send(viewer.port, "POST", url, {"text": KEPT, "document": "terms.pdf"})
        assert status == 200, body
        assert json.loads(body)["facts"] == [{"text": KEPT, "document": "terms.pdf"}]
        assert load_evals(folder / EVALS_FILENAME).facts[0].text == KEPT

        assert send(viewer.port, "POST", url, {"text": "x"})[0] == 400
        status, body = send(viewer.port, "DELETE", url, {"text": KEPT, "document": "terms.pdf"})
        assert status == 200 and json.loads(body)["facts"] == []
    finally:
        viewer.stop()


def test_a_run_is_scored_again_from_the_text_it_kept(folder: Path, tmp_path: Path):
    """A passage added after a run is checked against the readings the run holds: nothing
    is read again, and every loader the run compared is scored."""
    from complydoc.evals import score_report

    file = folder / EVALS_FILENAME
    add_fact(file, ExpectedFact(text=LOST))
    report = cd.compare_loaders({"whole": Whole, "drops": DropsAClause}, paths=folder)
    out = tmp_path / "loaders.json"
    cd.write_json(report, out, detail="full")

    add_fact(file, ExpectedFact(text=KEPT, document="terms.pdf"))
    add_fact(file, ExpectedFact(text=NOWHERE))
    (folder / "terms.pdf").unlink()  # the documents are not needed again
    scored = score_report(load_report(out), file)

    assert scored.readers == ["whole", "drops"]
    lost, kept, nowhere = scored.checks
    assert (lost.found["whole"], lost.found["drops"] == "exact") == ("exact", False)
    assert kept.found == {"whole": "exact", "drops": "exact"}
    assert nowhere.found == {"whole": None, "drops": None}
    # The same answer the run itself gave for the fact it had.
    assert report.evals is not None and lost.found == report.evals.checks[0].found


def test_the_viewer_runs_the_facts_against_a_run_on_request(folder: Path, tmp_path: Path):
    add_fact(folder / EVALS_FILENAME, ExpectedFact(text="Terms and conditions"))
    out = tmp_path / "out"
    assert (
        runner.invoke(app, ["audit", str(folder), "--out", str(out), "--no-ocr", "-q"]).exit_code
        == 0
    )
    offline.disarm()
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><head></head><body></body></html>")
    viewer = launch_ui(out, port=0, open_browser=False, dist=dist, read_only=True)
    try:
        (report,) = viewer.reports()
        add_fact(folder / EVALS_FILENAME, ExpectedFact(text="Neither party is liable"))
        status, body = send(viewer.port, "GET", f"/api/reports/{report.id}/evals/score")
        assert status == 200, body
        scored = json.loads(body)
        (reader,) = scored["readers"]
        assert [(c["fact"], c["found"][reader]) for c in scored["checks"]] == [
            ("Terms and conditions", "exact"),
            ("Neither party is liable", "exact"),
        ]
        assert send(viewer.port, "GET", "/api/reports/nope/evals/score")[0] == 404
    finally:
        viewer.stop()
