"""The standalone LangChain loaders that replace `langchain-community`'s.

Skipped unless the `integrations` dependency group is installed. The expected
values were measured on the sample documents, as in the guide
`docs/guides/replace-langchain-community.md`.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pymupdf4llm = pytest.importorskip("langchain_pymupdf4llm")

import complydoc as cd  # noqa: E402

SAMPLE = Path(cd.__file__).parent / "sample"
CONTRACT = (
    Path(__file__).parents[3] / "viewer" / "sample" / "documents" / "master-services-agreement.pdf"
)


def test_pymupdf4llm_is_offline_and_tagged():
    report = cd.inspect_documents(
        pymupdf4llm.PyMuPDF4LLMLoader(str(SAMPLE / "employee-record.pdf"))
    )
    assert report.loader.network_attempts == []
    assert report.loader.error is None
    assert report.loader.tags == ["LangChain", "PyMuPDF4LLM"]
    assert {"source", "page", "file_path"} <= set(report.loader.metadata_keys)
    assert report.documents[0].sensitive.matches


@pytest.mark.skipif(not CONTRACT.exists(), reason="needs the viewer's sample documents")
def test_pymupdf4llm_reads_a_two_column_contract_column_by_column():
    documents = pymupdf4llm.PyMuPDF4LLMLoader(str(CONTRACT)).load()
    assert "# **7. Confidentiality**" in documents[3].page_content


def test_comparing_the_retired_loader_with_its_replacement():
    community = pytest.importorskip("langchain_community.document_loaders")
    path = str(SAMPLE / "vendor-assessment.pdf")
    fact = "Two administrator accounts have no multi-factor authentication"
    report = cd.compare_loaders(
        {
            "pypdf": community.PyPDFLoader(path),
            "pymupdf4llm": pymupdf4llm.PyMuPDF4LLMLoader(path),
        },
        facts=[fact],
    )
    comparison = report.loader_comparison
    assert [row.name for row in comparison.loaders] == ["pypdf", "pymupdf4llm"]
    assert all(row.error is None for row in comparison.loaders)
