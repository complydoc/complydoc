"""Parser presets, folder comparisons and parser prices."""

from __future__ import annotations

import sys
import types

import pytest

import complydoc as cd
from complydoc.loaders import parsers
from complydoc.loaders.origin import loader_tags
from complydoc.report.tables import table_rows

CLAUSE = "Payment is due within thirty days of the invoice date."


class Document:
    def __init__(self, page_content: str, metadata: dict | None = None) -> None:
        self.page_content = page_content
        self.metadata = metadata or {}


@pytest.fixture
def folder(tmp_path):
    for name in ("a.pdf", "b.pdf"):
        (tmp_path / name).write_bytes(b"%PDF-1.4 placeholder")
    return tmp_path


def faithful(path: str) -> list[Document]:
    return [Document(f"{CLAUSE} File {path}.", {"source": path, "page": 0})]


def fails_on_b(path: str) -> list[Document]:
    if path.endswith("b.pdf"):
        raise RuntimeError("cannot parse")
    return [Document("Terms apply.", {"source": path, "page": 0})]


def test_a_folder_runs_each_loader_once_per_file(folder):
    report = cd.compare_loaders({"faithful": faithful, "partial": fails_on_b}, paths=folder)
    rows = {row.name: row for row in report.loader_comparison.loaders}
    assert rows["faithful"].documents == 2
    assert rows["partial"].documents == 1
    assert list(rows["partial"].failures) == [str(folder / "b.pdf")]
    assert any("failed on 1 file" in limitation.statement for limitation in report.limitations)


def test_facts_are_checked_per_loader(folder):
    report = cd.compare_loaders(
        {"faithful": faithful, "partial": fails_on_b}, paths=folder, facts=[CLAUSE]
    )
    comparison = report.loader_comparison
    assert comparison.facts[0].found == {"faithful": "exact", "partial": None}
    assert {row.name: row.facts_found for row in comparison.loaders} == {
        "faithful": 1,
        "partial": 0,
    }
    assert any("Expected facts were not found" in item.statement for item in report.limitations)


def test_facts_appear_in_the_report_and_tables(folder, tmp_path):
    report = cd.compare_loaders(
        {"faithful": faithful, "partial": fails_on_b}, paths=folder, facts=[CLAUSE]
    )
    html = cd.write_html(report, tmp_path / "report.html").read_text(encoding="utf-8")
    assert "Expected facts" in html
    rows = table_rows(report, "facts")
    assert {(row["loader"], row["found"]) for row in rows} == {
        ("faithful", "exact"),
        ("partial", None),
    }


def test_a_hosted_preset_needs_network_permission(folder):
    hosted = parsers.LoaderSpec(name="hosted", factory=faithful, network=True)
    with pytest.raises(ValueError, match="allow_network=True"):
        cd.compare_loaders({"local": faithful, "hosted": hosted}, paths=folder)


def test_a_preset_needs_paths():
    spec = parsers.LoaderSpec(name="local", factory=faithful)
    with pytest.raises(TypeError, match="pass paths="):
        cd.compare_loaders({"a": spec, "b": [Document(CLAUSE)]})


def test_parser_cost_comes_from_pricing(folder):
    priced = parsers.LoaderSpec(name="priced", factory=faithful, price_key="azure_layout")
    report = cd.compare_loaders({"local": faithful, "priced": priced}, paths=folder)
    rows = {row.name: row for row in report.loader_comparison.loaders}
    assert rows["priced"].parser_usd == pytest.approx(2 * 10.0 / 1000)
    assert rows["local"].parser_usd is None
    assert any(item.area == "Parser prices" for item in report.limitations)


@pytest.mark.parametrize(
    ("preset", "module", "package"),
    [
        (lambda: parsers.docling(), "langchain_docling.loader", "langchain-docling"),
        (lambda: parsers.unstructured(), "langchain_unstructured", "langchain-unstructured"),
        (lambda: parsers.llamaparse(), "llama_parse", "llama-parse"),
    ],
)
def test_a_missing_library_says_what_to_install(monkeypatch, preset, module, package):
    monkeypatch.setitem(sys.modules, module, None)
    with pytest.raises(ImportError, match=package):
        preset().factory("contract.pdf")


def test_presets_declare_network_and_price():
    assert not parsers.docling().network
    assert parsers.unstructured().price_key is None
    assert parsers.unstructured(api=True).network
    assert parsers.llamaparse(tier="agentic").price_key == "llamaparse_agentic"
    azure = parsers.azure_document_intelligence(endpoint="https://x", api_key="k")
    assert (azure.network, azure.price_key) == (True, "azure_layout")
    with pytest.raises(ValueError, match="tier"):
        parsers.llamaparse(tier="premium")  # type: ignore[arg-type]


def test_documents_without_a_source_get_the_file_path():
    loaded = parsers._WithSource(lambda: [Document("text")], "/tmp/x.pdf").load()
    assert loaded[0].metadata == {"source": "/tmp/x.pdf"}


class _FakeAzure:
    """Azure's Document Intelligence SDK, as far as the preset uses it."""

    def __init__(self) -> None:
        self.requests: list[dict[str, object]] = []
        line = types.SimpleNamespace
        self.result = types.SimpleNamespace(
            content="# Agreement\n\nPayment is due within thirty days.",
            pages=[
                types.SimpleNamespace(page_number=1, lines=[line(content="Agreement")]),
                types.SimpleNamespace(
                    page_number=2,
                    lines=[line(content="Payment is due"), line(content="within thirty days.")],
                ),
            ],
        )
        fake = self

        class Client:
            def __init__(self, endpoint: str, credential: object) -> None:
                fake.requests.append({"endpoint": endpoint, "credential": credential})

            def begin_analyze_document(self, model: str, **kwargs: object) -> object:
                fake.requests.append({"model": model, **kwargs})
                return types.SimpleNamespace(result=lambda: fake.result)

        self.sdk = types.SimpleNamespace(DocumentIntelligenceClient=Client)
        self.credentials = types.SimpleNamespace(AzureKeyCredential=lambda key: ("key", key))


@pytest.mark.parametrize(
    ("mode", "format_", "texts", "pages"),
    [
        ("markdown", "markdown", ["# Agreement\n\nPayment is due within thirty days."], [None]),
        ("single", "text", ["# Agreement\n\nPayment is due within thirty days."], [None]),
        ("page", "text", ["Agreement", "Payment is due within thirty days."], [1, 2]),
    ],
)
def test_azure_calls_its_sdk_and_numbers_pages_from_one(
    monkeypatch, tmp_path, mode, format_, texts, pages
):
    fake = _FakeAzure()
    monkeypatch.setitem(sys.modules, "azure.ai.documentintelligence", fake.sdk)
    monkeypatch.setitem(sys.modules, "azure.core.credentials", fake.credentials)
    pdf = tmp_path / "contract.pdf"
    pdf.write_bytes(b"%PDF-1.4")

    preset = parsers.azure_document_intelligence(
        endpoint="https://example.cognitiveservices.azure.com", api_key="k", mode=mode
    )
    documents = preset.factory(str(pdf)).load()

    assert fake.requests[0] == {
        "endpoint": "https://example.cognitiveservices.azure.com",
        "credential": ("key", "k"),
    }
    request = fake.requests[1]
    assert request["model"] == "prebuilt-layout"
    assert request["output_content_format"] == format_
    assert [d["page_content"] for d in documents] == texts
    assert [d["metadata"].get("page_number") for d in documents] == pages
    assert all(d["metadata"]["source"] == str(pdf) for d in documents)
    assert loader_tags(preset) == ["Azure Document Intelligence", "hosted"]


def test_azure_names_its_sdk_when_it_is_missing(monkeypatch):
    monkeypatch.setitem(sys.modules, "azure.ai.documentintelligence", None)
    preset = parsers.azure_document_intelligence(endpoint="https://x", api_key="k")
    with pytest.raises(ImportError, match="azure-ai-documentintelligence"):
        preset.factory("contract.pdf")


def test_azure_refuses_an_unknown_mode():
    with pytest.raises(ValueError, match="mode"):
        parsers.azure_document_intelligence(endpoint="https://x", api_key="k", mode="html")  # type: ignore[arg-type]
