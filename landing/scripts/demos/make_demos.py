"""Write the data behind the landing page's two interactive demos.

Run from the repository root, after `make_documents.py`, with the
`integrations` group installed (it has the LangChain loaders):

    uv sync --group integrations --group dev
    uv run python landing/scripts/demos/make_demos.py

- `src/data/loaders.json`: four LangChain PDF loaders run through
  `cd.compare_loaders` on five pages of `viewer/sample/documents`, each page's
  text as every loader returned it, the identifiers some loaders found and
  others missed, and whether each loader kept a passage the page must keep.
- `src/data/hidden.json`: `complydoc audit` on three documents with hidden
  text, the finding as the report gives it, where the hidden lines sit on the
  page, and the text PyPDFLoader hands the model.
- `src/assets/demos/*.webp`: the pages, drawn with pypdfium2.

Nothing in the files is written by hand: change a document or a loader here
and run the script again.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium

import complydoc as cd

ROOT = Path(__file__).resolve().parents[3]
LANDING = ROOT / "landing"
SAMPLES = ROOT / "viewer" / "sample" / "documents"
DEMO_DOCUMENTS = Path(__file__).parent / "documents"
DATA = LANDING / "src" / "data"
IMAGES = LANDING / "src" / "assets" / "demos"
WIDTH_PX = 900

LOADERS = {
    "PyPDFLoader": "pypdf",
    "PDFPlumberLoader": "pdfplumber",
    "PDFMinerLoader": "pdfminer.six",
    "PyMuPDF4LLMLoader": "PyMuPDF4LLM",
}

# One page each, and the passage it must come out with. The story is what the
# page is, never what a loader does to it: that is for the reader to find.
PAGES = [
    {
        "file": "master-services-agreement.pdf",
        "page": 2,
        "title": "Contract in two columns",
        "story": "A services agreement set in two columns, as most contracts are.",
        "fact": (
            "1.1 Any change to the scope must be agreed in writing"
            " by both parties before work begins."
        ),
    },
    {
        "file": "annual-report-2025.pdf",
        "page": 3,
        "title": "Financial table",
        "story": "An annual report's financial summary: one table, four columns of figures.",
        "fact": "Warehousing 21.4 24.1 3.2 3.9",
    },
    {
        "file": "employee-handbook.pdf",
        "page": 6,
        "title": "Contact list",
        "story": "The handbook's appendix: names, emails, phone numbers and NI numbers in a table.",
        "fact": "Aisha Khan Occupational health aisha.khan@harbour.example",
    },
    {
        "file": "rechnungen-2026-de.pdf",
        "page": 1,
        "title": "German invoice",
        "story": "An invoice in German, with a tax number and an IBAN to pay into.",
        "fact": "Wartung 12 354,17 4.250,00",
    },
    {
        "file": "supplier-invoices-scanned.pdf",
        "page": 1,
        "title": "Scanned invoice",
        "story": "A supplier invoice printed and scanned: a picture of a page.",
        "fact": "Invoice",
    },
]

HIDDEN = [
    {
        "file": DEMO_DOCUMENTS / "cv-data-engineer.pdf",
        "title": "A CV",
        "story": (
            "A candidate's CV, read by a screening assistant before anyone on the hiring team."
        ),
    },
    {
        "file": DEMO_DOCUMENTS / "supplier-invoice.pdf",
        "title": "A supplier invoice",
        "story": "An invoice in the accounts payable inbox, read by an agent that drafts payments.",
    },
    {
        "file": SAMPLES / "vendor-due-diligence.pdf",
        "title": "A vendor questionnaire",
        "story": (
            "A supplier's security questionnaire, summarised by a model for the procurement team."
        ),
    },
]


def draw(path: Path, page: int, name: str) -> dict[str, int | str]:
    """Draw a page as WebP, WIDTH_PX wide, and say where it went and its size."""
    pdf = pdfium.PdfDocument(str(path))
    sheet = pdf[page - 1]
    scale = WIDTH_PX / sheet.get_width()
    image = sheet.render(scale=scale).to_pil().convert("RGB")
    pdf.close()
    IMAGES.mkdir(parents=True, exist_ok=True)
    image.save(IMAGES / f"{name}.webp", format="WEBP", quality=72)
    return {"image": f"{name}.webp", "width": image.width, "height": image.height}


def merge_spacing(differences: list[dict]) -> list[dict]:
    """One row for a value two loaders found with different spacing around it.

    The comparison matches values exactly, so `020 7946 0100` and `020 7946 0100 `
    are two rows; joined, a value every loader found is no difference at all.
    """
    merged: dict[tuple[str, str], dict] = {}
    for row in differences:
        key = (row["label"], row["value"])
        if key in merged:
            merged[key]["found_by"] = sorted(set(merged[key]["found_by"]) | set(row["found_by"]))
        else:
            merged[key] = {**row, "found_by": list(row["found_by"])}
    for row in merged.values():
        row["missed_by"] = [name for name in LOADERS if name not in row["found_by"]]
    return [row for row in merged.values() if row["missed_by"]]


def loaders_demo() -> dict:
    from langchain_community.document_loaders import PDFMinerLoader, PDFPlumberLoader, PyPDFLoader
    from langchain_pymupdf4llm import PyMuPDF4LLMLoader

    pages = []
    for spec in PAGES:
        path = SAMPLES / spec["file"]
        report = cd.compare_loaders(
            {
                "PyPDFLoader": PyPDFLoader(str(path)),
                "PDFPlumberLoader": PDFPlumberLoader(str(path)),
                "PDFMinerLoader": PDFMinerLoader(str(path), mode="page"),
                "PyMuPDF4LLMLoader": PyMuPDF4LLMLoader(str(path), mode="page"),
            },
            facts=[spec["fact"]],
            # The values are synthetic test data, and the demo is about how each loader spells them.
            reveal=True,
        )
        document = report.documents[0]
        reading = next(p for p in document.extracted_text if p.number == spec["page"])
        texts = {report.loader_comparison.baseline: reading.text, **dict(reading.readings)}
        comparison = report.loader_comparison
        fact = comparison.facts[0]
        # Identifiers on this page: in the text of a loader that found them.
        differences = []
        for difference in comparison.identifier_differences:
            if difference.location != "text" or not any(
                difference.value.strip() in texts.get(name, "") for name in difference.found_by
            ):
                continue
            differences.append(
                {
                    "label": difference.label,
                    "value": difference.value.strip(),
                    "found_by": difference.found_by,
                    "missed_by": difference.missed_by,
                }
            )
        differences = merge_spacing(differences)
        pages.append(
            {
                "id": f"{path.stem}-{spec['page']}",
                "file": spec["file"],
                "page": spec["page"],
                "title": spec["title"],
                "story": spec["story"],
                **draw(path, spec["page"], f"{path.stem}-{spec['page']}"),
                "texts": {name: texts.get(name, "") for name in LOADERS},
                "fact": {
                    "text": fact.fact,
                    "found": {name: fact.found.get(name) for name in LOADERS},
                },
                "identifier_differences": differences,
            }
        )
        print(f"loaders  {spec['file']} page {spec['page']}: recommended {comparison.recommended}")
    return {
        "complydoc": cd.__version__,
        "loaders": [{"name": name, "library": library} for name, library in LOADERS.items()],
        "pages": pages,
    }


def squash(text: str) -> str:
    return re.sub(r"\s+", "", text)


def locate(path: Path, page: int, excerpt: str) -> list[dict[str, float]]:
    """The lines on the page that hold the excerpt, as fractions of the page.

    Matched on the characters before and after the masked part of the excerpt,
    with spaces left out, since the text layer and the excerpt space differently.
    """
    plain = [part for part in re.split(r"[•]+[^ ]*", excerpt) if part.strip()]
    head, tail = squash(plain[0])[:24], squash(plain[-1])[-24:]
    with pdfplumber.open(str(path)) as pdf:
        sheet = pdf.pages[page - 1]
        chars = [c for c in sheet.chars if c["text"].strip()]
        joined = "".join(c["text"] for c in chars)
        start = joined.find(head)
        end = joined.find(tail, start) + len(tail)
        if start < 0 or end < len(tail):
            raise SystemExit(f"{path.name}: the excerpt is not in the text layer")
        lines: dict[int, list[dict]] = {}
        for char in chars[start:end]:
            lines.setdefault(round(char["top"]), []).append(char)
        boxes = []
        for line in lines.values():
            x0, x1 = min(c["x0"] for c in line), max(c["x1"] for c in line)
            top, bottom = min(c["top"] for c in line), max(c["bottom"] for c in line)
            boxes.append(
                {
                    "x": x0 / sheet.width,
                    "y": top / sheet.height,
                    "w": (x1 - x0) / sheet.width,
                    "h": (bottom - top) / sheet.height,
                    "size_pt": round(line[0]["size"], 2),
                }
            )
        return boxes


def model_text(path: Path, page: int, excerpt: str) -> dict[str, str]:
    """PyPDFLoader's text for the page, cut around the hidden passage."""
    from langchain_community.document_loaders import PyPDFLoader

    text = PyPDFLoader(str(path)).load()[page - 1].page_content
    plain = [part for part in re.split(r"[•]+[^ ]*", excerpt) if part.strip()]
    head, tail = plain[0].strip()[:20], plain[-1].strip()[-20:]
    pattern = r"\s*".join(map(re.escape, head)) + r"[\s\S]*?" + r"\s*".join(map(re.escape, tail))
    match = re.search(pattern, text)
    if match is None:
        raise SystemExit(f"{path.name}: the hidden passage is not in PyPDFLoader's text")
    return {"before": text[: match.start()], "hidden": match.group(0), "after": text[match.end() :]}


def hidden_demo() -> dict:
    with tempfile.TemporaryDirectory() as folder:
        for spec in HIDDEN:
            shutil.copy2(spec["file"], Path(folder) / spec["file"].name)
        run = [
            str(Path(sys.executable).parent / "complydoc"),
            "audit",
            folder,
            "--print-json",
            "--quiet",
        ]
        report = json.loads(subprocess.run(run, check=True, capture_output=True, text=True).stdout)
    by_name = {document["relative_path"]: document for document in report["documents"]}
    cases = []
    for spec in HIDDEN:
        path: Path = spec["file"]
        document = by_name[path.name]
        hidden = [f for f in document["content_findings"] if f.get("hidden_reasons")]
        if len(hidden) != 1:
            raise SystemExit(
                f"{path.name}: expected one hidden passage, the audit found {len(hidden)}"
            )
        finding = hidden[0]
        page = finding["page"]
        cases.append(
            {
                "id": path.stem,
                "file": path.name,
                "title": spec["title"],
                "story": spec["story"],
                "page": page,
                **draw(path, page, f"hidden-{path.stem}"),
                "finding": {
                    key: finding[key]
                    for key in (
                        "excerpt",
                        "hidden_reasons",
                        "visibility",
                        "severity",
                        "instruction",
                        "instruction_reasons",
                    )
                },
                "boxes": locate(path, page, finding["excerpt"]),
                "model_text": model_text(path, page, finding["excerpt"]),
            }
        )
        print(
            f"hidden   {path.name} page {page}: {finding['visibility']}, "
            + ", ".join(finding["hidden_reasons"])
        )
    return {"complydoc": cd.__version__, "cases": cases}


def write(name: str, data: dict) -> None:
    out = DATA / name
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1).replace(f"{ROOT}/", "") + "\n")
    print(f"{out.stat().st_size / 1e3:.0f} kB  {out.relative_to(ROOT)}")


if __name__ == "__main__":
    write("loaders.json", loaders_demo())
    write("hidden.json", hidden_demo())
