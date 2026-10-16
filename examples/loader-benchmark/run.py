"""Read the six PDFs with complydoc and with each loader that imports.

complydoc's own extractors are compared with `complydoc audit --compare-extractor`.
pymupdf, docling, unstructured and OpenDataLoader PDF are not extractors complydoc
can name that way. Each is imported and, when that works, asked for its own text.
A library that does not import is recorded as not installed, and the run continues.
LlamaParse is not called: it needs an API key.

    uv run python examples/loader-benchmark/make_pdfs.py
    uv run python examples/loader-benchmark/run.py

The second command writes examples/loader-benchmark/out/results.json.
"""

from __future__ import annotations

import importlib.metadata
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

os.environ.setdefault("UNSTRUCTURED_DISABLE_NOTICE", "1")

from make_pdfs import (
    COVERED,
    LEFT,
    OFF_PAGE,
    RIGHT,
    TINY,
    WHITE,
    ZERO,
    write_all,
)

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

# Phrases the files plant, and the names the results are filed under.
CASES = {
    "white.pdf": {"white": WHITE},
    "tiny.pdf": {"tiny": TINY, "zero": ZERO},
    "behind-image.pdf": {"behind_image": COVERED},
    "off-page.pdf": {"off_page": OFF_PAGE},
    "two-column.pdf": {},
    # The raw footer holds an email and an IBAN. The audit masks both, so the
    # check is the words that stay either way.
    "footer.pdf": {"footer": "Accounts payable"},
}


def _version(dist: str) -> str | None:
    try:
        return importlib.metadata.version(dist)
    except importlib.metadata.PackageNotFoundError:
        return None


def _audit(pdf: Path, extractors: list[str]) -> dict[str, Any]:
    """One `complydoc audit` with every available extractor named for comparison."""
    reports = OUT / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    command = [
        str(Path(sys.executable).with_name("complydoc")),
        "audit",
        str(pdf),
        "--no-ocr",
        "--quiet",
        "--print-json",
        "--jobs",
        "1",
        "--out",
        str(reports),
    ]
    for name in extractors:
        command.extend(["--compare-extractor", name])
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(
            f"complydoc audit {pdf.name} exited {result.returncode}\n{result.stderr[-2000:]}"
        )
    report = json.loads(result.stdout)
    document = report["documents"][0]
    page = document["extracted_text"][0]
    findings = document.get("content_findings") or []
    matches = (document.get("sensitive") or {}).get("matches") or []
    return {
        "command": command[1:],
        "kept": page.get("kept") or report["run"].get("extractor"),
        "readings": {"complydoc": page.get("text") or "", **(page.get("readings") or {})},
        "content_findings": [
            {
                "visibility": item.get("visibility"),
                "instruction": item.get("instruction"),
                "severity": item.get("severity"),
                "reasons": item.get("hidden_reasons") or [],
                "excerpt": item.get("excerpt"),
            }
            for item in findings
        ],
        "identifiers": [
            {
                "category": item.get("category"),
                "severity": item.get("severity"),
                "evidence": item.get("evidence"),
                "masked": item.get("masked"),
            }
            for item in matches
        ],
    }


def _library_text() -> dict[str, Any]:
    """Each optional or direct library reader, or why it was not run."""
    readers: dict[str, Any] = {}

    def pypdf_text(path: Path) -> str:
        from pypdf import PdfReader

        return PdfReader(str(path)).pages[0].extract_text() or ""

    def pdfplumber_text(path: Path) -> str:
        import pdfplumber

        with pdfplumber.open(path) as pdf:
            return pdf.pages[0].extract_text() or ""

    readers["pypdf"] = {"version": _version("pypdf"), "read": pypdf_text, "via": "extract_text"}
    readers["pdfplumber"] = {
        "version": _version("pdfplumber"),
        "read": pdfplumber_text,
        "via": "extract_text() with the library default, not complydoc's settings",
    }

    try:
        import pymupdf
    except ImportError as exc:
        readers["pymupdf"] = {"version": None, "error": f"not installed ({exc})"}
    else:

        def pymupdf_text(path: Path) -> str:
            document = pymupdf.open(path)
            try:
                return document[0].get_text() or ""
            finally:
                document.close()

        readers["pymupdf"] = {
            "version": _version("pymupdf"),
            "read": pymupdf_text,
            "via": "page.get_text()",
        }

    try:
        from docling.document_converter import DocumentConverter
    except ImportError as exc:
        readers["docling"] = {"version": None, "error": f"not installed ({exc})"}
    else:
        converter = DocumentConverter()

        def docling_text(path: Path) -> str:
            result = converter.convert(str(path))
            return result.document.export_to_markdown() or ""

        readers["docling"] = {
            "version": _version("docling"),
            "read": docling_text,
            "via": "DocumentConverter, markdown export",
        }

    try:
        from unstructured.partition.pdf import partition_pdf
    except ImportError as exc:
        readers["unstructured"] = {"version": None, "error": f"not installed ({exc})"}
    else:

        def unstructured_text(path: Path) -> str:
            elements = partition_pdf(filename=str(path), strategy="fast")
            return "\n".join(element.text for element in elements if getattr(element, "text", None))

        readers["unstructured"] = {
            "version": _version("unstructured"),
            "read": unstructured_text,
            "via": "partition_pdf(strategy='fast')",
        }

    try:
        from opendataloader_pdf import convert
    except ImportError as exc:
        readers["opendataloader"] = {"version": None, "error": f"not installed ({exc})"}
    else:
        odl_out = OUT / "opendataloader"
        odl_out.mkdir(parents=True, exist_ok=True)

        def opendataloader_text(path: Path) -> str:
            convert(str(path), output_dir=str(odl_out), format="text", quiet=True)
            return (odl_out / f"{path.stem}.txt").read_text(encoding="utf-8")

        readers["opendataloader"] = {
            "version": _version("opendataloader-pdf"),
            "read": opendataloader_text,
            "via": "convert(format='text'), safety filters left on",
        }

    return readers


def _flat(text: str) -> str:
    return " ".join(text.split())


def _keeps(text: str, phrase: str) -> bool:
    return _flat(phrase) in _flat(text)


def _columns(text: str) -> str:
    """How a two-column page came back, judged on the two sentences."""
    flat = _flat(text)
    left = _flat(" ".join(LEFT))
    right = _flat(" ".join(RIGHT))
    across = _flat(f"{LEFT[0]} {RIGHT[0]}")
    if left in flat and right in flat and flat.index(left) < flat.index(right):
        return "left column, then the right"
    if across in flat:
        return "across the line, left fragment then right"
    if right in flat and left in flat:
        return "right column, then the left"
    if "forty pounds" in flat and "forty pence" in flat:
        return "both fees, in another order"
    if "forty pounds" in flat or "forty pence" in flat:
        return "one column only"
    return "neither column"


def main() -> None:
    pdfs = write_all(HERE / "pdfs")
    from complydoc.ingest.extractors.registry import all_extractors

    available = [item.id for item in all_extractors() if item.available()]
    compared = [name for name in available if name != "complydoc"]
    libraries = _library_text()

    cases: list[dict[str, Any]] = []
    for pdf in pdfs:
        audit = _audit(pdf, compared)
        direct: dict[str, Any] = {}
        for name, reader in libraries.items():
            if "read" not in reader:
                direct[name] = {"error": reader["error"], "version": reader["version"]}
                continue
            try:
                text = reader["read"](pdf)
            except Exception as exc:
                direct[name] = {
                    "error": f"{type(exc).__name__}: {exc}",
                    "version": reader["version"],
                }
                continue
            direct[name] = {
                "version": reader["version"],
                "via": reader["via"],
                "text": text,
            }

        phrases = CASES[pdf.name]
        presence: dict[str, dict[str, bool]] = {}
        sources = {**audit["readings"]}
        for name, item in direct.items():
            if "text" in item:
                sources[f"{name} library"] = item["text"]
        for label, phrase in phrases.items():
            presence[label] = {name: _keeps(text, phrase) for name, text in sources.items()}

        columns = (
            {name: _columns(text) for name, text in sources.items()}
            if pdf.name == "two-column.pdf"
            else None
        )
        cases.append(
            {
                "file": pdf.name,
                "audit": audit,
                "libraries": direct,
                "phrases": presence,
                "columns": columns,
            }
        )

    payload = {
        "extractors": available,
        "compare_extractors": compared,
        "libraries": {
            name: {
                "version": item.get("version"),
                "via": item.get("via"),
                "error": item.get("error"),
            }
            for name, item in libraries.items()
        },
        "skipped": [
            {
                "name": "llamaparse",
                "reason": "LlamaParse was skipped because it needs an API key.",
            }
        ],
        "cases": cases,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    destination = OUT / "results.json"
    destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"wrote {destination.relative_to(Path.cwd())}")
    print("LlamaParse was skipped because it needs an API key.")
    for case in cases:
        print(f"\n{case['file']}")
        if case["phrases"]:
            for label, found in case["phrases"].items():
                kept = ", ".join(name for name, yes in found.items() if yes) or "nobody"
                print(f"  {label}: {kept}")
        if case["columns"]:
            for name, how in case["columns"].items():
                print(f"  columns {name}: {how}")
        for finding in case["audit"]["content_findings"]:
            print(
                f"  flag {finding['severity']} {finding['visibility']}: "
                f"{', '.join(finding['reasons']) or finding['instruction']}"
            )
        for match in case["audit"]["identifiers"]:
            print(f"  identifier {match['category']} {match['masked']}")


if __name__ == "__main__":
    main()
