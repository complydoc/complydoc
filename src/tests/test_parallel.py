"""Running documents in parallel, and reading a folder as a sample.

Neither is allowed to change a finding. `--jobs` is a wall-clock decision and
`--sample` is a scope decision, so the first must produce byte-identical
findings and the second must state that it read only part of the folder.
"""

from __future__ import annotations

import types
from multiprocessing import get_all_start_methods

import pytest

from complydoc.audit.run import resolve_jobs, run_audit
from complydoc.ingest.base import IngestOptions
from complydoc.ingest.registry import load_document
from complydoc.report.json_writer import to_dict
from tests.helpers import FIXTURES


def findings(report):
    """The report with everything that legitimately varies between runs removed."""
    data = to_dict(report)
    for key in (
        "started_at",
        "finished_at",
        "duration_seconds",
        "jobs",
        "documents_read_after_worker_failure",
    ):
        data["run"].pop(key, None)
    data["limitations"] = [x for x in data["limitations"] if x["area"] != "Parallel workers"]
    for document in data["documents"]:
        document.pop("timing", None)
        # How long an extractor took is wall clock, like the timings above it.
        for reading in document.get("extractions") or []:
            reading.pop("seconds", None)
    for key in [k for k in data.get("aggregate") or {} if "second" in k or "hours" in k]:
        data["aggregate"].pop(key)
    return data


@pytest.fixture(scope="module")
def serial(config):
    return run_audit(FIXTURES, config, ocr=False)


@pytest.fixture(scope="module")
def parallel(config):
    return run_audit(FIXTURES, config, ocr=False, jobs=3)


def test_workers_produce_the_same_findings_as_one_process(serial, parallel):
    assert findings(parallel) == findings(serial)


def test_documents_come_back_in_the_order_they_were_found(serial, parallel):
    """Results arrive out of order; the report must not."""
    assert [d.relative_path for d in parallel.documents] == [
        d.relative_path for d in serial.documents
    ]


def test_cost_stays_attached_to_its_own_document(parallel):
    for document in parallel.documents:
        assert document.cost is not None
        assert document.cost.path == document.path
        assert document.cost.page_count == document.page_count


def test_the_run_records_how_many_workers_it_used(parallel):
    assert parallel.run.jobs == 3


def test_jobs_resolve_to_something_usable():
    assert resolve_jobs(1, 40) == 1
    assert resolve_jobs(8, 3) == 3, "never more workers than documents"
    assert resolve_jobs(0, 0) == 1
    assert resolve_jobs(-4, 10) == 1


def test_a_small_folder_is_left_in_one_process():
    """Spreading fifteen documents over eleven cores was slower than not.

    Each worker loads its own OCR engine, so below a dozen documents a worker
    costs more to start than the documents it would go on to read.
    """
    assert resolve_jobs(0, 1) == 1
    assert resolve_jobs(0, 15) == 1


def test_a_large_folder_uses_the_machine():
    assert resolve_jobs(0, 120) > 1
    assert resolve_jobs(0, 1200) >= resolve_jobs(0, 120)


def test_asking_for_workers_overrides_the_judgement():
    """An explicit worker count is used as given."""
    assert resolve_jobs(4, 15) == 4


def test_a_sample_audits_fewer_documents(config, serial):
    report = run_audit(FIXTURES, config, ocr=False, sample=4)
    assert report.run.sample_size == 4
    assert len(report.documents) < len(serial.documents)
    assert len(report.documents) <= 4


def test_the_sample_size_counts_only_documents_it_chose(config, serial):
    """An earlier revision added the files discovery had already rejected.

    It reported a sample of four as a sample of eighteen, because every
    unsupported file in the folder was counted into it.
    """
    report = run_audit(FIXTURES, config, ocr=False, sample=4)
    unsupported = [s for s in serial.skipped if s.reason == "unsupported file type"]
    assert unsupported, "the fixture folder should contain a file complydoc cannot read"
    assert report.run.sampled_from == len(serial.documents) + len(serial.skipped) - len(unsupported)
    entry = next(x for x in report.limitations if x.area == "Sampling")
    assert f"to {report.run.sample_size} of the {report.run.sampled_from} " in entry.statement


def test_a_sample_says_it_is_a_sample(config):
    report = run_audit(FIXTURES, config, ocr=False, sample=4)
    entry = next(x for x in report.limitations if x.area == "Sampling")
    assert entry.severity == "important"
    assert "--sample" in entry.statement


def test_a_full_run_carries_no_sampling_caveat(serial):
    assert serial.run.sampled_from is None
    assert serial.run.sample_size is None
    assert not [x for x in serial.limitations if x.area == "Sampling"]


def test_asking_for_more_than_the_folder_holds_is_not_a_sample(config, serial):
    report = run_audit(FIXTURES, config, ocr=False, sample=10_000)
    assert report.run.sampled_from is None
    assert len(report.documents) == len(serial.documents)


def test_an_encrypted_pdf_opens_with_its_password():
    document = load_document(FIXTURES / "encrypted.pdf", IngestOptions(password="complydoc-test"))
    assert document.encrypted
    assert document.page_count > 0
    assert document.full_text.strip()


def test_the_wrong_password_reads_nothing():
    """Failing open would put an unreadable file in the report as an empty one."""
    for password in ("", "not-the-password"):
        document = load_document(FIXTURES / "encrypted.pdf", IngestOptions(password=password))
        assert document.encrypted
        assert document.page_count == 0
        assert document.load_warnings


def test_the_report_records_that_a_password_was_supplied(config):
    report = run_audit(FIXTURES, config, ocr=False, password="complydoc-test")
    assert report.run.password_used is True
    encrypted = next(d for d in report.documents if d.relative_path == "encrypted.pdf")
    assert encrypted.page_count > 0


def test_a_worker_that_stops_is_recovered_in_the_main_process(config, serial, monkeypatch):
    """A crashed worker breaks the pool; the documents it did not return are read here."""
    from concurrent.futures.process import BrokenProcessPool

    from complydoc.audit import run as audit_run

    class StoppingPool:
        def __init__(self, jobs, work):
            self.work = work

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def map(self, function, files, chunksize=1):
            yield audit_run._process(files[0], self.work)
            raise BrokenProcessPool("a worker process stopped")

    monkeypatch.setattr(audit_run, "_process_pool", StoppingPool)
    recovered = run_audit(FIXTURES, config, ocr=False, jobs=3)

    assert findings(recovered) == findings(serial)
    assert recovered.run.documents_read_after_worker_failure > 0
    assert any(item.area == "Parallel workers" for item in recovered.limitations)


# --- Forking a process that has loaded torch --------------------------------


def test_the_pool_avoids_forking_an_address_space_that_holds_torch(monkeypatch):
    """Every audit after the first one in a process used to lose its workers.

    The forkserver is started from this process and inherits what it has
    initialised. A worker forked from an address space where torch has brought
    up Metal and Objective-C state dies as `BrokenProcessPool` the moment it
    reads a document. `ner_available` loads that model here, on every audit that
    scans for identifiers, so the first audit forked cleanly and the next one
    read every document in the parent instead.
    """
    import sys

    from complydoc.audit.run import _pool_context

    monkeypatch.delitem(sys.modules, "torch", raising=False)
    before = _pool_context().get_start_method()

    monkeypatch.setitem(sys.modules, "torch", types.ModuleType("torch"))
    assert _pool_context().get_start_method() == "spawn", (
        "a pool forked from here would die on its first document"
    )

    # And the choice is about torch, not a blanket downgrade: without it the
    # forkserver and its preload are still used where they are available.
    assert before in {"forkserver", "spawn"}
    if "forkserver" in get_all_start_methods():
        assert before == "forkserver", "the preload is worth having where it is safe"
