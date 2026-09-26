"""Real `langchain-community` loaders through `inspect_documents`.

`langchain-community` is archived; these loaders stay tested because the
migration guide compares them with their standalone replacements, which
`test_langchain_standalone.py` covers.

Skipped unless the `integrations` dependency group is installed. The expected
values were measured on the sample documents that ship with complydoc, and are
the same ones the guide in `docs/guides/inspect-a-loader.md` reports.
"""

from __future__ import annotations

from pathlib import Path

import pytest

loaders = pytest.importorskip("langchain_community.document_loaders")

import complydoc as cd  # noqa: E402

SAMPLE = Path(cd.__file__).parent / "sample"


def test_pypdf_pages_and_metadata_keys():
    report = cd.inspect_documents(loaders.PyPDFLoader(str(SAMPLE / "employee-record.pdf")))
    document = report.documents[0]
    assert report.loader.documents_returned == 1
    assert document.page_count_known
    expected = {"source", "page", "page_label", "producer", "author"}
    assert expected <= set(report.loader.metadata_keys)
    assert document.sensitive.matches, "the sample carries identifiers in its text"


def test_no_loader_attempts_a_network_connection():
    report = cd.inspect_documents(loaders.PyPDFLoader(str(SAMPLE / "employee-record.pdf")))
    assert report.loader.network_attempts == []
    assert report.loader.error is None


def test_an_absolute_source_path_is_reported():
    report = cd.inspect_documents(
        loaders.PyPDFLoader(str((SAMPLE / "employee-record.pdf").resolve()))
    )
    assert "source" in report.documents[0].path_exposures


def test_the_producing_software_does_not_raise_a_quick_win(monkeypatch):
    """PyPDF's `producer` is labelled an organisation by the name model.

    That finding is low severity and model-detected, so it is listed but does
    not on its own recommend stripping metadata. The path is relative so the
    `source` key does not raise the same quick win for a different reason.
    """
    monkeypatch.chdir(SAMPLE)
    report = cd.inspect_documents(loaders.PyPDFLoader("employee-record.pdf"))
    assert all(not f.significant for f in report.documents[0].metadata_findings)
    assert not any(w.id == "strip_metadata" for w in report.quick_wins)


def test_a_pdf_date_in_pdfplumber_metadata_is_not_a_card_number():
    """`CreationDate` is `D:20260909103836+01'00'`, whose digits pass Luhn."""
    report = cd.inspect_documents(loaders.PDFPlumberLoader(str(SAMPLE / "employee-record.pdf")))
    assert not [f for f in report.documents[0].metadata_findings if f.category == "card_number"]


def test_a_docx_loader_returns_no_page_numbers():
    pytest.importorskip("docx2txt")
    report = cd.inspect_documents(loaders.Docx2txtLoader(str(SAMPLE / "supplier-list.docx")))
    document = report.documents[0]
    assert not document.page_count_known
    assert report.loader.metadata_keys == ["source"]


def test_comparing_pypdf_and_pdfplumber():
    path = str(SAMPLE / "employee-record.pdf")
    report = cd.compare_loaders(
        {"pypdf": loaders.PyPDFLoader(path), "pdfplumber": loaders.PDFPlumberLoader(path)}
    )
    comparison = report.loader_comparison
    assert [row.name for row in comparison.loaders] == ["pypdf", "pdfplumber"]
    assert comparison.documents == {}
    assert "page_label" in comparison.metadata_keys
    assert [r.extractor for r in report.documents[0].extractions] == ["pypdf", "pdfplumber"]
    # The producer string is the same value under `producer` and `Producer`.
    assert not [d for d in comparison.identifier_differences if d.location == "metadata"]


def test_a_langchain_splitter_can_be_inspected():
    splitters = pytest.importorskip("langchain_text_splitters")
    splitter = splitters.RecursiveCharacterTextSplitter(chunk_size=200, chunk_overlap=0)
    report = cd.inspect_chunks(
        splitter,
        loaders.PyPDFLoader(str(SAMPLE / "vendor-assessment.pdf")),
        facts=["Two administrator accounts have no multi-factor authentication"],
    )
    assert report.stats.count > 1
    assert report.chunks[0].document.endswith("vendor-assessment.pdf")
    assert report.facts[0].status in {"whole", "split"}
