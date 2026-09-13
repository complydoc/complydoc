"""Comparing several loaders on the same input.

Stand-in loaders with the LangChain document shape, so this runs without it
installed. `tests/test_langchain.py` compares real ones.
"""

from __future__ import annotations

import json

import pytest

import complydoc as cd

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


def test_the_comparison_is_written_to_json_and_html(tmp_path):
    report = compare()
    data = json.loads(cd.write_json(report, tmp_path / "r.json").read_text(encoding="utf-8"))
    assert data["loader_comparison"]["baseline"] == "faithful"
    assert data["loader_comparison"]["identifier_differences"][0]["missed_by"] == ["drops"]

    html = cd.write_html(report, tmp_path / "r.html").read_text(encoding="utf-8")
    assert "Loaders compared" in html
    assert "Found by some loaders only" in html
    differences_table = html.split("Found by some loaders only")[1].split("</table>")[0]
    assert "jane.doe@example.com" not in differences_table


def test_metadata_keys_differing_only_in_case_are_the_same_key():
    report = cd.compare_loaders(
        [
            Loader([PAGE_TWO], {"author": "A", "page_label": "1"}),
            Loader([PAGE_TWO], {"Author": "A"}),
        ]
    )
    assert report.loader_comparison.metadata_keys == {"page_label": ["Loader"]}
