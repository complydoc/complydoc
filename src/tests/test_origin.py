"""Tags naming the framework and library a loader comes from."""

from __future__ import annotations

import functools

import pytest

import complydoc as cd
from complydoc.loaders.origin import loader_tags


def loader_class(module: str, name: str) -> type:
    def initialise(self, path: str = "document.pdf") -> None:
        self.path = path

    def load(self):
        return [
            {
                "page_content": "Payment is due within thirty days.",
                "metadata": {"source": self.path, "page": 0},
            }
        ]

    return type(name, (), {"__module__": module, "__init__": initialise, "load": load})


@pytest.mark.parametrize(
    ("module", "name", "expected"),
    [
        ("langchain_community.document_loaders.pdf", "PyPDFLoader", ["LangChain", "pypdf"]),
        (
            "langchain_community.document_loaders.pdf",
            "PDFPlumberLoader",
            ["LangChain", "pdfplumber"],
        ),
        (
            "langchain_unstructured.document_loaders",
            "UnstructuredLoader",
            ["LangChain", "Unstructured"],
        ),
        ("llama_index.readers.file.docs.base", "PDFReader", ["LlamaIndex", "pypdf"]),
        ("llama_index.core.readers.file.base", "SimpleDirectoryReader", ["LlamaIndex"]),
        ("my_company.loaders", "PyPDFLoader", []),
    ],
)
def test_tags_come_from_the_module_and_known_classes(module, name, expected):
    cls = loader_class(module, name)
    assert loader_tags(cls) == expected
    assert loader_tags(cls()) == expected
    assert loader_tags(cls().load) == expected
    assert loader_tags(functools.partial(cls)) == expected


def test_documents_and_plain_functions_get_no_tags():
    assert loader_tags([{"page_content": "text", "metadata": {}}]) == []
    assert loader_tags(lambda: []) == []


def test_presets_declare_their_tags():
    assert loader_tags(cd.parsers.docling()) == ["LangChain", "Docling"]
    assert loader_tags(cd.parsers.unstructured()) == ["LangChain", "Unstructured"]
    assert loader_tags(cd.parsers.unstructured(api=True)) == ["LangChain", "Unstructured", "hosted"]
    assert loader_tags(cd.parsers.llamaparse()) == ["LlamaParse", "hosted"]


def test_tags_reach_the_report_its_tables_and_its_json(tmp_path):
    for name in ("a.pdf", "b.pdf"):
        (tmp_path / name).write_bytes(b"%PDF-1.4 " + name.encode())
    report = cd.compare_loaders(
        {
            "pypdf": loader_class("langchain_community.document_loaders.pdf", "PyPDFLoader"),
            "own": loader_class("tests.fake_loaders", "OwnLoader"),
        },
        paths=tmp_path,
        components=["sensitive"],
    )
    assert [row.tags for row in report.loader_comparison.loaders] == [["LangChain", "pypdf"], []]
    assert report.to_pandas("loaders")["tags"].tolist() == ["LangChain, pypdf", ""]

    out = tmp_path / "out"
    html = cd.write_html(report, out / "report.html").read_text(encoding="utf-8")
    assert '<span class="ltag">LangChain</span>' in html
    assert '<span class="ltag">pypdf</span>' in html
    assert "·" not in html.split('<span class="ltag">LangChain</span>')[1][:80]

    loaded = cd.load_report(cd.write_json(report, out / "report.json"))
    assert loaded.loader_comparison.loaders[0].tags == ["LangChain", "pypdf"]


def test_a_single_inspected_loader_carries_its_tags():
    cls = loader_class("langchain_community.document_loaders.pdf", "PDFPlumberLoader")
    report = cd.inspect_documents(cls(), components=["sensitive"])
    assert report.loader.tags == ["LangChain", "pdfplumber"]
