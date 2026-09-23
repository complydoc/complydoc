"""Write the viewer's two sample reports from the documents in ./documents.

Run from the repository root, after make_documents.py:

    uv run python viewer/sample/make_reports.py

- audit.json: a full audit with page pictures, pypdf compared against the
  default reader, and every page read by OCR as well.
- loaders.json: pypdf against pdfplumber as LangChain loaders, with two facts
  the documents are expected to contain.

Absolute paths are cut to the repository, so the reports carry nothing about
the machine they were made on.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import complydoc as cd

ROOT = Path(__file__).resolve().parents[2]
DOCUMENTS = Path(__file__).parent / "documents"
FIXTURES = ROOT / "viewer" / "src" / "fixtures"
FACTS = [
    "The supplier shall provide the services described in the order",
    "Invoices are payable within thirty days of the date of the invoice",
]


def audit() -> None:
    out = FIXTURES / "audit.json"
    run = [
        str(Path(sys.executable).parent / "complydoc"), "audit", str(DOCUMENTS.relative_to(ROOT)),
        "--compare-extractor", "pypdf", "--ocr-compare", "--page-images", "--detail", "full",
        "--print-json", "--quiet",
    ]
    out.write_text(subprocess.run(run, cwd=ROOT, check=True, capture_output=True, text=True).stdout)


def loaders() -> None:
    from langchain_community.document_loaders import DirectoryLoader, PDFPlumberLoader, PyPDFLoader

    folder = str(DOCUMENTS.relative_to(ROOT))
    report = cd.compare_loaders(
        {
            "pypdf": DirectoryLoader(folder, glob="*.pdf", loader_cls=PyPDFLoader),
            "pdfplumber": DirectoryLoader(folder, glob="*.pdf", loader_cls=PDFPlumberLoader),
        },
        facts=FACTS,
    )
    cd.write_json(report, FIXTURES / "loaders.json")


def shrink_pictures(path: Path, width: int = 800, quality: int = 50) -> None:
    """Re-encode each page picture at the width the viewer shows it, so the sample stays small."""
    import base64
    import io
    import json

    from PIL import Image

    report = json.loads(path.read_text())
    for document in report["documents"]:
        for preview in document.get("previews", []):
            uri = preview.get("image_data_uri")
            if not uri:
                continue
            image = Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1]))).convert("RGB")
            if image.width > width:
                image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
            buffer = io.BytesIO()
            # WebP keeps a page of text smallest, and a chart's colour with it.
            image.save(buffer, format="WEBP", quality=quality)
            preview["image_data_uri"] = "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode()
            preview["image_width_px"], preview["image_height_px"] = image.size
    path.write_text(json.dumps(report, ensure_ascii=False))


def strip_machine(path: Path) -> None:
    path.write_text(path.read_text().replace(f"{ROOT}/", ""))


if __name__ == "__main__":
    audit()
    shrink_pictures(FIXTURES / "audit.json")
    loaders()
    for name in ("audit.json", "loaders.json"):
        strip_machine(FIXTURES / name)
        print(f"{(FIXTURES / name).stat().st_size / 1e6:.1f} MB  {name}")
