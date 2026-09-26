"""Comparing loaders over a folder of several file types."""

from __future__ import annotations

from pathlib import Path

import pytest

import complydoc as cd
from complydoc.loaders.formats import extensions, loader_formats
from complydoc.loaders.parsers import LoaderSpec
from complydoc.loaders.spec_file import compare_from_file
from complydoc.report.tables import table_rows

CLAUSE = "Payment is due within thirty days of the invoice date."
SUPPLIER = "The supplier list names four approved vendors in Lisbon."


class Document:
    def __init__(self, page_content: str, metadata: dict | None = None) -> None:
        self.page_content = page_content
        self.metadata = metadata or {}


def _text(path: str) -> str:
    return CLAUSE if path.endswith(".pdf") else SUPPLIER


class PyPDFLoader:
    """Named as LangChain's, which reads PDFs only; raises on anything else, as it does."""

    def __init__(self, path: str) -> None:
        self.path = path

    def load(self) -> list[Document]:
        if not self.path.endswith(".pdf"):
            raise ValueError("invalid pdf header")
        return [Document(_text(self.path), {"source": self.path, "page": 0, "page_label": "1"})]


class Docx2txtLoader:
    """Named as LangChain's Word loader."""

    def __init__(self, path: str) -> None:
        self.path = path

    def load(self) -> list[Document]:
        if not self.path.endswith(".docx"):
            raise ValueError("File is not a zip file")
        return [Document(_text(self.path), {"source": self.path})]


def everything(path: str) -> list[Document]:
    """A loader that reads every type, and says nothing about which."""
    return [Document(_text(path), {"source": path, "page": 0})]


def pdf_words_reordered(path: str) -> list[Document]:
    words = _text(path).split()
    return [Document(" ".join(reversed(words)), {"source": path, "page": 0})]


@pytest.fixture
def folder(tmp_path: Path) -> Path:
    for name in ("a.pdf", "b.pdf", "list.docx", "costs.xlsx"):
        (tmp_path / name).write_bytes(b"placeholder")
    return tmp_path


def by_type(report: cd.AuditReport) -> dict[str, object]:
    return {f.format: f for f in report.loader_comparison.formats}


def test_known_loaders_are_given_only_their_own_file_types(folder: Path):
    report = cd.compare_loaders({"pypdf": PyPDFLoader, "docx2txt": Docx2txtLoader}, paths=folder)
    rows = {row.name: row for row in report.loader_comparison.loaders}
    assert rows["pypdf"].formats == [".pdf"]
    assert rows["pypdf"].failures == {}
    assert sorted(Path(p).name for p in rows["pypdf"].skipped) == ["costs.xlsx", "list.docx"]
    assert rows["docx2txt"].failures == {}
    assert rows["docx2txt"].documents == 1
    assert not any("failed on" in limitation.statement for limitation in report.limitations)


def test_a_loader_nothing_is_known_about_is_given_every_file(folder: Path):
    report = cd.compare_loaders({"pypdf": PyPDFLoader, "everything": everything}, paths=folder)
    rows = {row.name: row for row in report.loader_comparison.loaders}
    assert rows["everything"].formats is None
    assert rows["everything"].skipped == []
    assert rows["everything"].documents == 4


def test_formats_limits_a_loader_by_extension_or_format_name(folder: Path):
    report = cd.compare_loaders(
        {"pypdf": PyPDFLoader, "sheets": everything, "anything": everything},
        paths=folder,
        formats={"sheets": ["xlsx"], "anything": [".PDF", "docx"]},
    )
    rows = {row.name: row for row in report.loader_comparison.loaders}
    assert rows["sheets"].formats == [".xlsx", ".xlsm"]
    assert rows["sheets"].documents == 1
    assert rows["anything"].formats == [".pdf", ".docx"]
    assert rows["anything"].documents == 3


def test_formats_needs_paths_and_known_loader_names(folder: Path):
    documents = [Document(CLAUSE, {"source": "a.pdf"})]
    with pytest.raises(TypeError, match="needs paths"):
        cd.compare_loaders({"a": documents, "b": documents}, formats={"a": ["pdf"]})
    with pytest.raises(ValueError, match="not compared: nobody"):
        cd.compare_loaders(
            {"pypdf": PyPDFLoader, "all": everything}, paths=folder, formats={"nobody": ["pdf"]}
        )
    with pytest.raises(ValueError, match="names no file type"):
        cd.compare_loaders(
            {"pypdf": PyPDFLoader, "all": everything}, paths=folder, formats={"all": []}
        )


def test_a_document_the_first_loader_skipped_is_measured_against_the_next(folder: Path):
    report = cd.compare_loaders(
        {"pypdf": PyPDFLoader, "docx2txt": Docx2txtLoader, "everything": everything},
        paths=folder,
    )
    documents = {d.relative_path: d for d in report.documents}
    assert sorted(documents) == ["a.pdf", "b.pdf", "costs.xlsx", "list.docx"]
    assert [r.extractor for r in documents["list.docx"].extractions] == ["docx2txt", "everything"]
    assert [r.extractor for r in documents["costs.xlsx"].extractions] == ["everything"]
    assert report.loader_comparison.baselines == {
        "costs.xlsx": "everything",
        "list.docx": "docx2txt",
    }
    # The first loader's row counts the documents it read, not the ones it was lent.
    rows = {row.name: row for row in report.loader_comparison.loaders}
    assert rows["pypdf"].documents == 2


def test_a_file_the_first_loader_failed_on_still_reaches_the_report(folder: Path):
    def fails_on_b(path: str) -> list[Document]:
        if path.endswith("b.pdf"):
            raise RuntimeError("cannot parse")
        return everything(path)

    report = cd.compare_loaders(
        {"partial": fails_on_b, "everything": everything},
        paths=folder,
        formats={"partial": ["pdf"]},
    )
    assert "b.pdf" in [d.relative_path for d in report.documents]
    assert report.loader_comparison.baselines == {
        "b.pdf": "everything",
        "costs.xlsx": "everything",
        "list.docx": "everything",
    }


def test_each_file_type_has_its_own_rows_and_verdict(folder: Path):
    report = cd.compare_loaders(
        {"pypdf": PyPDFLoader, "reordered": pdf_words_reordered, "docx2txt": Docx2txtLoader},
        paths=folder,
        formats={"reordered": ["pdf"]},
        facts=[CLAUSE],
    )
    types = by_type(report)
    assert list(types) == ["pdf", "docx", "xlsx"]

    pdf = types["pdf"]
    assert pdf.label == "PDF"
    assert pdf.documents == 2
    assert [row.name for row in pdf.loaders] == ["pypdf", "reordered"]
    assert pdf.skipped_by == ["docx2txt"]
    assert pdf.facts == 1
    assert pdf.recommended == "pypdf"
    rows = {row.name: row for row in pdf.loaders}
    assert rows["pypdf"].similarity == 1.0
    assert rows["reordered"].similarity < 1.0
    assert rows["pypdf"].facts_found == 1
    assert rows["reordered"].facts_found == 0

    word = types["docx"]
    assert [row.name for row in word.loaders] == ["docx2txt"]
    assert word.recommended is None
    assert word.verdict == "docx2txt is the only loader meant for Word files"

    excel = types["xlsx"]
    assert excel.loaders == []
    assert excel.skipped_by == ["pypdf", "reordered", "docx2txt"]
    assert excel.verdict == "none of the loaders is meant for Excel files"

    comparison = report.loader_comparison
    assert comparison.recommended is None
    assert comparison.verdict.startswith("Each file type is decided on its own.")
    assert "Use pypdf for PDF, docx2txt for Word." in comparison.verdict
    assert "None of the loaders is meant for Excel files." in comparison.verdict


def test_one_loader_best_at_every_type_is_recommended_for_the_folder(tmp_path: Path):
    for name in ("a.pdf", "list.docx"):
        (tmp_path / name).write_bytes(b"placeholder")

    def fails_on_everything(path: str) -> list[Document]:
        raise RuntimeError("cannot parse")

    report = cd.compare_loaders(
        {"broken": fails_on_everything, "everything": everything}, paths=tmp_path
    )
    types = by_type(report)
    assert [types[f].recommended for f in ("pdf", "docx")] == ["everything", "everything"]
    assert report.loader_comparison.recommended == "everything"
    assert "every file type here (PDF, Word)" in report.loader_comparison.verdict


def test_a_fact_is_checked_only_by_loaders_given_its_file_type(folder: Path):
    report = cd.compare_loaders(
        {"pypdf": PyPDFLoader, "docx2txt": Docx2txtLoader}, paths=folder, facts=[CLAUSE, SUPPLIER]
    )
    checks = {check.fact: check for check in report.loader_comparison.facts}
    assert set(checks[CLAUSE].found) == {"pypdf"}
    assert set(checks[SUPPLIER].found) == {"docx2txt"}
    assert not any("Expected facts were not found" in item.statement for item in report.limitations)


def test_metadata_keys_are_compared_between_loaders_of_the_same_type(folder: Path):
    report = cd.compare_loaders(
        {"pypdf": PyPDFLoader, "docx2txt": Docx2txtLoader, "everything": everything},
        paths=folder,
    )
    # Among the PDFs, `page_label` is pypdf's alone; docx2txt read none, so it is not
    # counted as missing it. Among the Word files, docx2txt returns no `page`.
    assert report.loader_comparison.metadata_keys == {
        "page_label": ["pypdf"],
        "page": ["everything"],
    }


def test_documents_returned_by_some_count_only_loaders_meant_for_the_type(folder: Path):
    report = cd.compare_loaders({"pypdf": PyPDFLoader, "docx2txt": Docx2txtLoader}, paths=folder)
    assert report.loader_comparison.documents == {}


def test_a_preset_declares_its_file_types(folder: Path):
    spec = LoaderSpec(name="pdfs", factory=everything, formats=("pdf",))
    assert loader_formats(spec) == (".pdf",)
    report = cd.compare_loaders({"pdfs": spec, "everything": everything}, paths=folder)
    assert report.loader_comparison.loaders[0].documents == 2
    assert loader_formats(cd.parsers.docling()) is not None
    assert loader_formats(cd.parsers.unstructured()) is None


def test_extensions_are_normalised():
    assert extensions([".PDF", "pdf", "docx", "image"]) == (
        ".pdf",
        ".docx",
        ".png",
        ".jpg",
        ".jpeg",
        ".tif",
        ".tiff",
        ".bmp",
    )
    assert extensions("csv") == (".csv",)


def test_the_per_type_comparison_is_in_the_json_tables_and_html(folder: Path, tmp_path: Path):
    report = cd.compare_loaders({"pypdf": PyPDFLoader, "docx2txt": Docx2txtLoader}, paths=folder)
    cd.write_json(report, tmp_path / "out.json")
    back = cd.load_report(tmp_path / "out.json")
    assert back.loader_comparison.formats == report.loader_comparison.formats
    assert back.loader_comparison.baselines == report.loader_comparison.baselines

    rows = [row for row in table_rows(report, "loader_formats") if row["format"] == "docx"]
    assert {row["loader"]: row["given"] for row in rows} == {"pypdf": False, "docx2txt": True}

    cd.write_html(report, tmp_path / "out.html")
    page = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert "By file type" in page
    assert "skipped" in page


def test_a_comparison_file_names_each_loaders_file_types(folder: Path, tmp_path: Path):
    spec = tmp_path / "loaders.yaml"
    spec.write_text(
        f"""
loaders:
  pdfs:
    loader: {__name__}:everything
    formats: [pdf]
  all: {__name__}:everything
paths: {folder}
""",
        encoding="utf-8",
    )
    report = compare_from_file(spec)
    rows = {row.name: row for row in report.loader_comparison.loaders}
    assert rows["pdfs"].formats == [".pdf"]
    assert rows["pdfs"].documents == 2
    assert rows["all"].documents == 4
