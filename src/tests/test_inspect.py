"""Inspecting what another loader produced.

The stand-ins here have the shapes real frameworks use — `page_content` and
`metadata` for LangChain, `text` and `metadata` for LlamaIndex — so these run
without either installed. `src/tests/integration/test_langchain.py` runs real loaders.
"""

from __future__ import annotations

import contextlib
import socket

import pytest

import complydoc as cd
from complydoc import offline
from complydoc.readiness.base import SignalStatus


class LangChainDocument:
    def __init__(self, page_content: str, metadata: dict | None = None) -> None:
        self.page_content = page_content
        self.metadata = metadata or {}


class LlamaIndexDocument:
    def __init__(self, text: str, metadata: dict | None = None) -> None:
        self.text = text
        self.metadata = metadata or {}


class Loader:
    def __init__(self, documents: list) -> None:
        self.documents = documents

    def load(self) -> list:
        return list(self.documents)


def signal(report: cd.AuditReport, signal_id: str):  # type: ignore[name-defined]
    return next(s for s in report.documents[0].readiness.signals if s.id == signal_id)


def test_pages_come_from_zero_based_page_metadata():
    docs = [
        LangChainDocument("first page", {"source": "/tmp/a.pdf", "page": 0}),
        LangChainDocument("second page", {"source": "/tmp/a.pdf", "page": 1}),
    ]
    report = cd.inspect_documents(Loader(docs))
    document = report.documents[0]
    assert [p.number for p in document.extracted_text] == [1, 2]
    assert document.page_count_known


def test_documents_are_grouped_by_their_source():
    docs = [
        LangChainDocument("a", {"source": "/tmp/folder/a.pdf", "page": 0}),
        LangChainDocument("b", {"source": "/tmp/folder/b.pdf", "page": 0}),
    ]
    report = cd.inspect_documents(docs)
    assert sorted(d.relative_path for d in report.documents) == ["a.pdf", "b.pdf"]


def test_a_loader_without_page_numbers_leaves_the_page_count_unknown():
    report = cd.inspect_documents([LangChainDocument("whole file", {"source": "/tmp/a.docx"})])
    document = report.documents[0]
    assert not document.page_count_known
    assert document.format == cd.DocumentFormat.DOCX


def test_documents_sharing_a_page_are_merged_into_it():
    docs = [
        LangChainDocument("title", {"source": "/tmp/a.pdf", "page_number": 1}),
        LangChainDocument("paragraph", {"source": "/tmp/a.pdf", "page_number": 1}),
    ]
    report = cd.inspect_documents(docs)
    pages = report.documents[0].extracted_text
    assert len(pages) == 1
    assert "title" in pages[0].text and "paragraph" in pages[0].text


def test_page_signals_are_not_measured_on_loader_text():
    """Loader output cannot show tables or a text layer, so neither is scored."""
    report = cd.inspect_documents([LangChainDocument("Name | Amount\nA | 1\n" * 10)])
    assert signal(report, "table_count").status is SignalStatus.NOT_APPLICABLE
    assert signal(report, "text_layer_present").status is SignalStatus.NOT_APPLICABLE


def test_the_text_is_recorded_as_coming_from_the_loader():
    report = cd.inspect_documents([LangChainDocument("text", {"source": "/tmp/a.pdf"})])
    assert report.documents[0].extracted_text[0].source == "loader"
    assert report.loader is not None
    assert report.loader.documents_returned == 1


def test_an_identifier_in_metadata_is_found_and_masked():
    docs = [LangChainDocument("Terms apply.", {"author": "jane.doe@example.com"})]
    report = cd.inspect_documents(docs)
    findings = report.documents[0].metadata_findings
    assert [f.key for f in findings] == ["author"]
    assert findings[0].category == "email_address"
    assert "jane.doe@example.com" not in findings[0].masked


def test_metadata_repeated_on_every_page_is_reported_once():
    docs = [
        LangChainDocument(
            f"page {n}", {"source": "/tmp/a.pdf", "page": n, "author": "jane.doe@example.com"}
        )
        for n in range(3)
    ]
    report = cd.inspect_documents(docs)
    assert len(report.documents[0].metadata_findings) == 1
    assert report.documents[0].metadata_findings[0].page == 1


def test_an_absolute_path_in_metadata_is_reported():
    docs = [LangChainDocument("text", {"source": "/Users/someone/contracts/a.pdf"})]
    report = cd.inspect_documents(docs)
    assert report.documents[0].path_exposures == ["source"]
    assert any(
        limitation.area == "Metadata" and "absolute file paths" in limitation.statement
        for limitation in report.limitations
    )


def test_identifiers_in_metadata_count_towards_exposure():
    clean = cd.inspect_documents([LangChainDocument("Terms apply.", {"title": "Terms"})])
    leaking = cd.inspect_documents(
        [LangChainDocument("Terms apply.", {"author": "jane.doe@example.com"})]
    )

    def exposure(report):
        return next(f.score for f in report.overall.factors if f.key == "exposure")

    assert exposure(leaking) < exposure(clean)


def test_a_network_attempt_during_loading_is_recorded():
    class PhonesHome(Loader):
        def load(self) -> list:
            with contextlib.suppress(Exception):
                socket.create_connection(("example.invalid", 443), timeout=1)
            return super().load()

    report = cd.inspect_documents(PhonesHome([LangChainDocument("text")]))
    assert report.loader.network_attempts
    assert "example.invalid" in report.loader.network_attempts[0]
    assert report.documents, "a loader that swallows the refusal still returns its documents"


def test_a_loader_stopped_by_the_guard_produces_a_report_saying_so():
    class NeedsNetwork(Loader):
        def load(self) -> list:
            socket.create_connection(("example.invalid", 443), timeout=1)
            return []

    report = cd.inspect_documents(NeedsNetwork([]))
    assert report.loader.error
    assert not report.documents
    assert any(
        limitation.area == "Loader" and "did not finish" in limitation.statement
        for limitation in report.limitations
    )


def test_the_guard_is_restored_afterwards():
    """The socket module comes back exactly as it was.

    Starts from a disarmed guard, because the command-line tests arm it for the
    life of the process and `guarded()` leaves a guard it did not arm alone.
    """
    was_armed = offline.is_armed()
    offline.disarm()
    try:
        original = socket.socket.connect
        cd.inspect_documents([LangChainDocument("text")])
        assert not offline.is_armed()
        assert socket.socket.connect is original
    finally:
        if was_armed:
            offline.arm()


def test_documents_passed_in_directly_have_no_load_time():
    report = cd.inspect_documents([LangChainDocument("text")])
    assert report.loader.seconds is None
    assert report.loader.name == "documents"


def test_a_single_document_is_accepted():
    report = cd.inspect_documents(LangChainDocument("text"))
    assert report.loader.documents_returned == 1


def test_llamaindex_mappings_and_strings_are_accepted():
    report = cd.inspect_documents(
        [LlamaIndexDocument("a"), {"page_content": "b"}, {"text": "c"}, "d"]
    )
    assert report.loader.documents_returned == 4


def test_a_path_is_rejected_with_a_pointer_to_full_audit():
    with pytest.raises(TypeError, match="full_audit"):
        cd.inspect_documents("contracts/")


def test_an_unrecognised_document_is_rejected():
    with pytest.raises(TypeError, match="page_content or text"):
        cd.inspect_documents([object()])


def test_metadata_leaks_become_a_quick_win():
    report = cd.inspect_documents(
        [
            LangChainDocument(
                "text", {"source": "/Users/someone/a.pdf", "author": "jane.doe@example.com"}
            )
        ]
    )
    assert any(w.id == "strip_metadata" for w in report.quick_wins)


def test_an_allowed_loader_reaches_the_network_and_is_recorded(tmp_path):
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port = server.getsockname()[1]

    class Fetches(Loader):
        def load(self) -> list:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                pass
            return super().load()

    try:
        report = cd.inspect_documents(Fetches([LangChainDocument("text")]), allow_network=True)
    finally:
        server.close()

    assert report.loader.network_allowed
    assert report.loader.error is None
    assert any(str(port) in attempt for attempt in report.loader.network_attempts)
    assert any(
        limitation.area == "Loader" and "may have left this machine" in limitation.statement
        for limitation in report.limitations
    )
    html = cd.write_html(report, tmp_path / "report.html").read_text(encoding="utf-8")
    assert "document content may have left this machine" in html


def test_allowing_the_network_is_stated_even_when_nothing_connects(tmp_path):
    was_armed = offline.is_armed()
    offline.disarm()
    try:
        original = socket.socket.connect
        report = cd.inspect_documents([LangChainDocument("text")], allow_network=True)
        assert socket.socket.connect is original
        assert not offline.is_armed()
    finally:
        if was_armed:
            offline.arm()

    assert report.run.offline_guard == "armed", "complydoc's own processing stays guarded"
    assert any("made no connections" in limitation.statement for limitation in report.limitations)
    html = cd.write_html(report, tmp_path / "report.html").read_text(encoding="utf-8")
    assert "was allowed network access" in html


def test_the_network_is_blocked_unless_allowed():
    report = cd.inspect_documents([LangChainDocument("text")])
    assert not report.loader.network_allowed
