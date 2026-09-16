"""Giving each document a deadline, and stopping the one that passes it."""

from __future__ import annotations

import shutil
from concurrent.futures import Future

import pytest

from complydoc.audit import run as audit_run
from complydoc.audit.run import run_audit
from complydoc.ingest.base import TIMED_OUT, SkipRecord
from tests.helpers import FIXTURES


class FakeProcess:
    def __init__(self) -> None:
        self.killed = False

    def kill(self) -> None:
        self.killed = True


class FakePool:
    """A pool whose futures finish at once, except for the documents in `hangs`."""

    def __init__(self, hangs: set[str]) -> None:
        self._processes = {1: FakeProcess()}
        self.hangs = hangs
        self.submitted: list[str] = []
        self.shutdowns = 0

    def submit(self, function, path):
        self.submitted.append(path.name)
        future: Future = Future()
        if path.name not in self.hangs:
            future.set_result(audit_run._Outcome(None, SkipRecord(path=path, reason="read")))
        return future

    def shutdown(self, wait: bool = True, cancel_futures: bool = False) -> None:
        self.shutdowns += 1


@pytest.fixture
def pools(monkeypatch):
    """Every pool `_timed` builds, with the second document hanging in the first."""
    built: list[FakePool] = []

    def build(jobs, work):
        pool = FakePool({"two.pdf"} if not built else set())
        built.append(pool)
        return pool

    monkeypatch.setattr(audit_run, "_process_pool", build)
    return built


def test_a_document_past_its_deadline_is_skipped_and_the_workers_killed(tmp_path, pools):
    files = [tmp_path / name for name in ("one.pdf", "two.pdf", "three.pdf")]
    outcomes = list(audit_run._timed(files, work=None, jobs=2, timeout=0.01))

    assert [o.skipped.path.name for o in outcomes] == ["one.pdf", "two.pdf", "three.pdf"]
    assert [o.skipped.reason for o in outcomes] == ["read", TIMED_OUT, "read"]
    assert outcomes[1].skipped.detail == "no result after 0.01s"
    assert pools[0]._processes[1].killed
    # The pool is rebuilt once, and the document that was in flight beside the one
    # that hung goes back in the queue rather than being lost.
    assert len(pools) == 2
    assert pools[1].submitted == ["three.pdf"]


def test_no_timeout_leaves_the_run_as_it_was(tmp_path, config):
    shutil.copy(FIXTURES / "native_text.pdf", tmp_path / "one.pdf")
    report = run_audit(tmp_path, config, ("sensitive",), ocr=False)
    assert report.run.timeout_seconds is None
    assert not report.skipped


def test_a_real_run_records_what_it_stopped(tmp_path, config):
    for name in ("first.pdf", "second.pdf"):
        shutil.copy(FIXTURES / "native_text.pdf", tmp_path / name)

    # Small enough that starting a worker already passes it, so both documents are
    # stopped: the point is that the run finishes and says what it did not read.
    report = run_audit(tmp_path, config, ("sensitive",), ocr=False, jobs=2, timeout=0.001)

    assert report.run.timeout_seconds == 0.001
    assert {record.reason for record in report.skipped} == {TIMED_OUT}
    assert not report.documents
    [limitation] = [x for x in report.limitations if x.area == "Files not examined"]
    assert "0.001s" in limitation.statement
    assert "were stopped" in limitation.statement
