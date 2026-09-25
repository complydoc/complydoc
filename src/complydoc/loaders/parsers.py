"""Presets for document parsers, for use with `compare_loaders(..., paths=...)`.

    import complydoc as cd

    report = cd.compare_loaders(
        {
            "pymupdf4llm": PyMuPDF4LLMLoader,
            "docling": cd.parsers.docling(),
            "llamaparse": cd.parsers.llamaparse(tier="cost_effective"),
        },
        paths="./contracts",
        allow_network=True,
    )

Each preset returns a `LoaderSpec`: a factory that builds a loader for one file,
whether the parser sends documents to a hosted service, and the `parsers` entry in
`pricing.yaml` used to estimate its cost per page. The parser libraries are not
dependencies; each preset imports its library when it runs and says what to install
when it is missing.

A hosted preset only runs with `allow_network=True`.
"""

from __future__ import annotations

import importlib
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from complydoc.loaders.inspection import SOURCE_KEYS

__all__ = [
    "LoaderSpec",
    "azure_document_intelligence",
    "docling",
    "llamaparse",
    "unstructured",
]


@dataclass(frozen=True, slots=True)
class LoaderSpec:
    """How to build a loader for one file, and what running it involves."""

    name: str
    factory: Callable[[str], Any]
    """Called with a file path; returns a loader or a list of documents."""
    network: bool = False
    """True when the parser sends documents to a hosted service."""
    price_key: str | None = None
    """Entry under `parsers` in `pricing.yaml`, for the cost per page."""
    tags: tuple[str, ...] = ()
    """Framework and library names shown beside the loader in reports."""


class _WithSource:
    """Loads through `load`, and adds the file path to documents whose metadata lacks one."""

    def __init__(self, load: Callable[[], Any], path: str) -> None:
        self._load = load
        self._path = path

    def load(self) -> list[Any]:
        documents = list(self._load())
        for document in documents:
            metadata = getattr(document, "metadata", None)
            if isinstance(metadata, dict) and not any(key in metadata for key in SOURCE_KEYS):
                metadata["source"] = self._path
        return documents


def _require(module: str, package: str) -> Any:
    try:
        return importlib.import_module(module)
    except ImportError as exc:
        raise ImportError(f"this preset needs {package}: pip install {package}") from exc


def docling(export: Literal["markdown", "chunks"] = "markdown", **options: Any) -> LoaderSpec:
    """Docling through `langchain-docling`, run locally.

    `export="markdown"` returns one document per file; `"chunks"` returns Docling's
    own chunks. `options` are passed to `DoclingLoader`.
    """

    def factory(path: str) -> _WithSource:
        # The `local` extra is what converts on this machine; without it the
        # package can only reach a Docling service.
        loader_module = _require("langchain_docling.loader", '"langchain-docling[local]"')
        export_type = (
            loader_module.ExportType.MARKDOWN
            if export == "markdown"
            else loader_module.ExportType.DOC_CHUNKS
        )
        loader = loader_module.DoclingLoader(file_path=path, export_type=export_type, **options)
        return _WithSource(loader.load, path)

    return LoaderSpec(
        name="docling", factory=factory, price_key="docling", tags=("LangChain", "Docling")
    )


def unstructured(
    *,
    api: bool = False,
    api_key: str | None = None,
    strategy: Literal["fast", "hi_res", "ocr_only", "auto"] = "fast",
    **options: Any,
) -> LoaderSpec:
    """Unstructured through `langchain-unstructured`.

    `api=True` partitions through the hosted Unstructured API. `options` are passed
    to `UnstructuredLoader`.
    """

    def factory(path: str) -> _WithSource:
        module = _require("langchain_unstructured", "langchain-unstructured")
        arguments: dict[str, Any] = {"partition_via_api": api, "strategy": strategy, **options}
        if api_key is not None:
            arguments["api_key"] = api_key
        loader = module.UnstructuredLoader(file_path=path, **arguments)
        return _WithSource(loader.load, path)

    return LoaderSpec(
        name="unstructured-api" if api else "unstructured",
        factory=factory,
        tags=("LangChain", "Unstructured"),
        network=api,
        price_key="unstructured_api" if api else None,
    )


_LLAMAPARSE_TIERS = ("fast", "cost_effective", "agentic", "agentic_plus")


def llamaparse(
    *,
    api_key: str | None = None,
    tier: Literal["fast", "cost_effective", "agentic", "agentic_plus"] = "cost_effective",
    **options: Any,
) -> LoaderSpec:
    """LlamaParse, hosted, through the `llama-parse` package.

    `tier` selects the price entry; parsing options such as the mode are passed in
    `options` to `LlamaParse`.
    """
    if tier not in _LLAMAPARSE_TIERS:
        raise ValueError(f"tier must be one of {', '.join(_LLAMAPARSE_TIERS)}")

    def factory(path: str) -> _WithSource:
        module = _require("llama_parse", "llama-parse")
        arguments: dict[str, Any] = {"result_type": "markdown", **options}
        if api_key is not None:
            arguments["api_key"] = api_key
        parser = module.LlamaParse(**arguments)
        return _WithSource(lambda: parser.load_data(path), path)

    return LoaderSpec(
        name=f"llamaparse-{tier.replace('_', '-')}",
        factory=factory,
        tags=("LlamaParse",),
        network=True,
        price_key=f"llamaparse_{tier}",
    )


_AZURE_PRICES = {"prebuilt-read": "azure_read", "prebuilt-layout": "azure_layout"}


def azure_document_intelligence(
    *,
    endpoint: str,
    api_key: str,
    model: str = "prebuilt-layout",
    mode: Literal["markdown", "page", "single"] = "markdown",
    **options: Any,
) -> LoaderSpec:
    """Azure AI Document Intelligence, hosted, through Azure's own SDK.

    `mode="markdown"` returns one Markdown document per file, `"single"` one plain
    text document, and `"page"` one document per page, numbered from 1 as
    `page_number`. `options` are passed to `begin_analyze_document`, such as
    `features`.

    This went through `langchain-community`'s loader until LangChain archived that
    package in June 2026. It calls the SDK that loader wrapped, with the same
    request, so the text is the same.
    """
    if mode not in ("markdown", "page", "single"):
        raise ValueError("mode must be one of markdown, page, single")

    def factory(path: str) -> _WithSource:
        sdk = _require("azure.ai.documentintelligence", "azure-ai-documentintelligence")
        credentials = _require("azure.core.credentials", "azure-ai-documentintelligence")
        client = sdk.DocumentIntelligenceClient(
            endpoint=endpoint, credential=credentials.AzureKeyCredential(api_key)
        )

        def load() -> list[dict[str, Any]]:
            with open(path, "rb") as file:
                poller = client.begin_analyze_document(
                    model,
                    body=file,
                    content_type="application/octet-stream",
                    output_content_format="markdown" if mode == "markdown" else "text",
                    **options,
                )
                result = poller.result()
            if mode == "page":
                return [
                    {
                        "page_content": " ".join(line.content for line in page.lines or []),
                        "metadata": {"source": path, "page_number": page.page_number},
                    }
                    for page in result.pages or []
                ]
            return [{"page_content": result.content or "", "metadata": {"source": path}}]

        return _WithSource(load, path)

    return LoaderSpec(
        name=f"azure-{model}",
        factory=factory,
        tags=("Azure Document Intelligence",),
        network=True,
        price_key=_AZURE_PRICES.get(model),
    )
