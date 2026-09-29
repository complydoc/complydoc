"""Comparing several loaders on the same input.

Stand-in loaders with the LangChain document shape, so this runs without it
installed. `src/tests/integration/test_langchain.py` compares real ones.
"""

from __future__ import annotations

import json

import pytest

import complydoc as cd
from tests.helpers import FIXTURES

SOURCE = "/tmp/compare/contract.pdf"

PAGE_ONE = "Agreement between the parties. Contact jane.doe@example.com for notices."
PAGE_TWO = "Payment terms are thirty days. Governing law is England and Wales."


class LangChainDocument:
    def __init__(self, page_content: str, metadata: dict | None = None) -> None:
        self.page_content = page_content
        self.metadata = metadata or {}


class Loader:
    def __init__(self, pages: list[str], extra: dict | None = None) -> None:
        self.pages = pages
        self.extra = extra or {}

    def load(self) -> list:
        return [
            LangChainDocument(text, {"source": SOURCE, "page": number, **self.extra})
            for number, text in enumerate(self.pages)
        ]


class Faithful(Loader):
    pass


class DropsContact(Loader):
    pass


def compare(**options):
    return cd.compare_loaders(
        {
            "faithful": Faithful([PAGE_ONE, PAGE_TWO], {"author": "jane.doe@example.com"}),
            "drops": DropsContact(["Agreement between the parties.", PAGE_TWO]),
        },
        **options,
    )


def test_the_first_loader_is_the_baseline():
    report = compare()
    assert report.loader_comparison.baseline == "faithful"
    assert report.loader.name == "faithful"
    assert [row.name for row in report.loader_comparison.loaders] == ["faithful", "drops"]


def test_every_loader_reading_is_listed_against_the_baseline():
    document = compare().documents[0]
    assert [r.extractor for r in document.extractions] == ["faithful", "drops"]
    assert document.extractions[0].similarity == 1.0
    assert document.extractions[1].similarity < 1.0
    assert document.disagreement is not None


def test_pages_carry_the_other_loaders_text():
    pages = compare().documents[0].extracted_text
    assert pages[0].readings == {"drops": "Agreement between the parties."}
    assert pages[1].readings == {"drops": PAGE_TWO}


def test_an_identifier_one_loader_dropped_is_listed():
    differences = compare().loader_comparison.identifier_differences
    in_text = [d for d in differences if d.location == "text"]
    assert [(d.category, d.found_by, d.missed_by) for d in in_text] == [
        ("email_address", ["faithful"], ["drops"])
    ]
    assert "jane.doe@example.com" not in in_text[0].value


def test_metadata_identifiers_are_compared_and_keys_listed():
    comparison = compare().loader_comparison
    in_metadata = [d for d in comparison.identifier_differences if d.location == "metadata"]
    assert [(d.keys, d.missed_by) for d in in_metadata] == [(["author"], ["drops"])]
    assert comparison.metadata_keys == {"author": ["faithful"]}


def test_the_same_value_under_differently_spelled_keys_is_not_a_difference():
    report = cd.compare_loaders(
        [
            Loader([PAGE_TWO], {"producer": "jane.doe@example.com"}),
            Loader([PAGE_TWO], {"Producer": "jane.doe@example.com"}),
        ]
    )
    assert report.loader_comparison.identifier_differences == []


def test_differences_become_an_important_limitation():
    report = compare()
    assert any(
        limitation.area == "Loaders"
        and limitation.severity == "important"
        and "some loaders and not others" in limitation.statement
        for limitation in report.limitations
    )


def test_unnamed_loaders_are_named_after_their_class_and_kept_distinct():
    report = cd.compare_loaders([Loader([PAGE_ONE]), Loader([PAGE_TWO])])
    assert [row.name for row in report.loader_comparison.loaders] == ["Loader", "Loader (2)"]


def test_documents_only_some_loaders_returned_are_listed():
    class Elsewhere(Loader):
        def load(self) -> list:
            return [LangChainDocument(PAGE_ONE, {"source": "/tmp/compare/other.pdf", "page": 0})]

    report = cd.compare_loaders({"a": Loader([PAGE_ONE]), "b": Elsewhere([])})
    assert sorted(report.loader_comparison.documents.values()) == [["a"], ["b"]]
    assert any("same documents" in limitation.statement for limitation in report.limitations)


def test_without_page_numbers_the_whole_document_is_compared():
    whole = [LangChainDocument(f"{PAGE_ONE}\n\n{PAGE_TWO}", {"source": SOURCE})]
    report = cd.compare_loaders({"paged": Loader([PAGE_ONE, PAGE_TWO]), "whole": whole})
    reading = report.documents[0].extractions[1]
    assert reading.extractor == "whole"
    assert reading.similarity == 1.0


def test_extracted_text_off_drops_the_text_but_keeps_the_comparison():
    report = compare(extracted_text=False)
    document = report.documents[0]
    assert document.extracted_text == []
    assert document.extractions[1].similarity < 1.0
    assert not report.run.extracted_text_used


def test_another_loaders_network_attempt_reaches_the_report():
    import contextlib
    import socket

    class PhonesHome(Loader):
        def load(self) -> list:
            with contextlib.suppress(Exception):
                socket.create_connection(("example.invalid", 443), timeout=1)
            return super().load()

    report = cd.compare_loaders({"quiet": Loader([PAGE_TWO]), "loud": PhonesHome([PAGE_TWO])})
    rows = {row.name: row for row in report.loader_comparison.loaders}
    assert rows["loud"].network_attempts and not rows["quiet"].network_attempts
    assert any("loud attempted" in limitation.statement for limitation in report.limitations)


def test_one_loader_is_not_a_comparison():
    with pytest.raises(ValueError, match="inspect_documents"):
        cd.compare_loaders([Loader([PAGE_ONE])])


def test_a_path_is_not_a_set_of_loaders():
    with pytest.raises(TypeError, match="mapping of names to loaders"):
        cd.compare_loaders("contract.pdf")


def test_the_comparison_is_written_to_json(tmp_path):
    report = compare()
    written = cd.write_json(report, tmp_path / "r.json").read_text(encoding="utf-8")
    data = json.loads(written)
    assert data["loader_comparison"]["baseline"] == "faithful"
    assert data["loader_comparison"]["identifier_differences"][0]["missed_by"] == ["drops"]
    # The identifiers only some loaders kept are named masked, like every other finding.
    assert "jane.doe@example.com" not in written


def test_metadata_keys_differing_only_in_case_are_the_same_key():
    report = cd.compare_loaders(
        [
            Loader([PAGE_TWO], {"author": "A", "page_label": "1"}),
            Loader([PAGE_TWO], {"Author": "A"}),
        ]
    )
    assert report.loader_comparison.metadata_keys == {"page_label": ["Loader"]}


def _pypdf_text(path) -> list[str]:
    from pypdf import PdfReader

    return [page.extract_text() or "" for page in PdfReader(str(path)).pages]


def _plumber_text(path) -> list[str]:
    import pdfplumber

    with pdfplumber.open(str(path)) as pdf:
        return [page.extract_text() or "" for page in pdf.pages]


class RealLoader:
    """A loader backed by a real library, so the two readings are genuine."""

    def __init__(self, reader, path) -> None:
        self.reader = reader
        self.path = path

    def load(self) -> list:
        return [
            LangChainDocument(text, {"source": str(self.path), "page": number})
            for number, text in enumerate(self.reader(self.path))
        ]


def test_two_readings_of_a_two_column_page_are_reported_as_reordered():
    """Same words, different order, which is what a two-column page does to a reader.

    The report entries carry the text masked, and a value covered over a
    slightly different span in each reading made two identical pages look like
    two different ones. The comparison reads what the loaders returned.
    """
    page = FIXTURES / "two_column.pdf"
    report = cd.compare_loaders(
        {
            "pypdf": RealLoader(_pypdf_text, page),
            "pdfplumber": RealLoader(_plumber_text, page),
        },
        facts=["The supplier shall provide the services described in the order"],
    )

    readings = {r.extractor: r for r in report.documents[0].extractions}
    other = readings["pdfplumber"]
    assert other.similarity < 1.0, "the two libraries walk the columns differently"
    assert other.reordered, "the same words in a different order, not different words"

    # The point of the comparison: the fact survives one reading and not the other.
    check = report.loader_comparison.facts[0]
    assert check.found["pypdf"] == "exact"
    assert check.found["pdfplumber"] is None

    # And the report can show why: the closest passage is two clauses spliced.
    assert check.nearest["pypdf"] is None, "nothing to explain where it was found"
    assert "however arising" in check.nearest["pdfplumber"]


# A sort code is reported where its label sits nearby, so the same digits are
# masked in one reading and left alone in the other once the order moves the
# label away from them. That is what made two identical pages compare as
# different once the report started carrying its text masked.
_MIDDLE = (
    "Payment is due on receipt of this invoice and the remaining balance is "
    "payable within thirty days of the date shown above"
)
_LABEL_BESIDE_DIGITS = f"Sort code: 12 34 56 {_MIDDLE}"
_LABEL_FAR_FROM_DIGITS = f"12 34 56 {_MIDDLE} Sort code:"


def test_the_comparison_reads_what_the_loaders_returned_not_the_masked_text():
    report = cd.compare_loaders(
        {
            "beside": Loader([_LABEL_BESIDE_DIGITS]),
            "far": Loader([_LABEL_FAR_FROM_DIGITS]),
        }
    )

    entry = report.documents[0]
    masked = {entry.extracted_text[0].text, entry.extracted_text[0].readings["far"]}
    assert len(masked) == 2, "the two readings mask the sort code differently"

    far = {r.extractor: r for r in entry.extractions}["far"]
    assert far.similarity < 1.0
    assert far.reordered, "same words, moved around, whatever the masking did to them"


def test_a_loader_naming_its_file_by_name_alone_is_matched_with_the_file_it_was_given(tmp_path):
    """OpenDataLoader's `source` is `contract.pdf`: still the file it read, not another one."""
    file = tmp_path / "contract.pdf"
    file.write_bytes(b"%PDF-1.4")

    def by_path(path: str) -> list:
        return [LangChainDocument(PAGE_ONE, {"source": path, "page": 0})]

    def by_name(path: str) -> list:
        return [LangChainDocument(PAGE_ONE, {"source": path.rsplit("/", 1)[-1], "page": 0})]

    report = cd.compare_loaders({"by_path": by_path, "by_name": by_name}, paths=[file])
    assert [d.relative_path for d in report.documents] == ["contract.pdf"]
    assert report.loader_comparison.documents == {}


def _pages_from(first: int):
    """A loader for a two-page PDF that numbers its pages from `first`."""

    def load(path: str) -> list:
        return [
            LangChainDocument(text, {"source": path, "page": first + index})
            for index, text in enumerate((PAGE_ONE, PAGE_TWO))
        ]

    return load


def test_a_loader_counting_pages_from_one_is_lined_up_with_one_counting_from_zero():
    """OpenDataLoader numbers a two-page PDF's pages 1 and 2; LangChain's loaders 0 and 1."""
    report = cd.compare_loaders(
        {"from_zero": _pages_from(0), "from_one": _pages_from(1)},
        paths=[FIXTURES / "native_text.pdf"],
    )
    (document,) = report.documents
    assert [page.number for page in document.extracted_text] == [1, 2]
    assert document.extractions[1].similarity == 1.0


def test_page_one_of_a_longer_pdf_is_not_taken_for_counting_from_one():
    """Pages 1 and 2 of a three-page PDF, counted from 0, may be all a loader returned."""
    report = cd.compare_loaders(
        {"a": _pages_from(1), "b": _pages_from(1)},
        paths=[FIXTURES / "mixed_page_sizes.pdf"],
    )
    (document,) = report.documents
    assert [page.number for page in document.extracted_text] == [2, 3]


def test_relative_paths_name_documents_from_the_folder_they_share(tmp_path, monkeypatch):
    folder = tmp_path / "documents" / "company"
    folder.mkdir(parents=True)
    file = folder / "contract.pdf"
    file.write_bytes(b"%PDF-1.4")
    monkeypatch.chdir(tmp_path)

    def read(path: str) -> list:
        return [LangChainDocument(PAGE_ONE, {"source": path, "page": 0})]

    report = cd.compare_loaders({"a": read, "b": read}, paths=["documents/company/contract.pdf"])
    assert [d.relative_path for d in report.documents] == ["contract.pdf"]


def _docling_chunk(text: str, page: int) -> LangChainDocument:
    item = {"label": "text", "prov": [{"page_no": page, "charspan": [0, len(text)]}]}
    return LangChainDocument(text, {"source": SOURCE, "dl_meta": {"doc_items": [item]}})


def test_docling_chunks_are_placed_on_the_pages_they_record():
    """DoclingLoader returns chunks, each naming its page in `dl_meta`, counted from 1."""
    docling = [_docling_chunk(PAGE_ONE, 1), _docling_chunk(PAGE_TWO, 2)]
    report = cd.compare_loaders({"pypdf": Faithful([PAGE_ONE, PAGE_TWO]), "docling": docling})
    (document,) = report.documents
    # Masked as every reading in the report is: page one holds an email address.
    first, second = (page.readings["docling"] for page in document.extracted_text)
    assert first.startswith("Agreement between the parties.")
    assert second == PAGE_TWO


def test_a_revealing_comparison_keeps_every_loaders_reading_masked_beside_it():
    """A viewer opens a revealing report masked: no loader's values may show there."""
    report = cd.compare_loaders(
        {"a": Faithful([PAGE_ONE, PAGE_TWO]), "b": Faithful([PAGE_ONE, PAGE_TWO])}, reveal=True
    )
    page = report.documents[0].extracted_text[0]
    assert "jane.doe@example.com" in page.readings["b"]
    assert page.masked_readings is not None
    assert "jane.doe@example.com" not in page.masked_readings["b"]
    assert "jane.doe@example.com" not in (page.masked_text or "")


def test_page_images_put_a_picture_of_each_page_beside_the_loaders_text():
    report = cd.compare_loaders(
        {"a": _pages_from(0), "b": _pages_from(0)},
        paths=[FIXTURES / "native_text.pdf"],
        page_images=True,
    )
    (document,) = report.documents
    assert [p.number for p in document.previews] == [1, 2]
    assert all(
        p.image_data_uri and p.image_data_uri.startswith("data:image/") for p in document.previews
    )
    assert report.run.page_images_used


def test_page_images_need_files_to_render():
    with pytest.raises(TypeError, match="needs paths"):
        cd.compare_loaders({"a": Faithful([PAGE_ONE]), "b": Faithful([PAGE_ONE])}, page_images=True)
