"""Take the landing page's screenshots of the viewer, from a demo run on the sample documents.

    make viewer-bundle
    uv run python landing/scripts/screenshots.py

Builds the demo reports from the documents bundled with complydoc: a pipeline observed
twice, with and without masking, into a vector store; an audit with a second reader and page pictures; and a
chunks run with two chunk sizes. It serves them with the viewer and takes each screenshot
with headless Chrome, at twice the pixels, in the dark theme and the light one, into
`landing/src/assets/screens` as WebP.

Chrome runs with a profile of its own, made for the run and deleted after it. Nothing is
sent anywhere: the pipeline's embedding model is a stand-in that looks up `localhost`, so
the trace has a host to show.
"""

from __future__ import annotations

import argparse
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import warnings
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "src" / "complydoc" / "sample"
OUT = ROOT / "landing" / "src" / "assets" / "screens"
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

WIDTH, HEIGHT = 1440, 900
"""The viewport, in CSS pixels: 16 by 10, the ratio the landing page frames them in."""

SPLITTERS = (
    "langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=400 chunk_overlap=0",
    "langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=1200 chunk_overlap=120",
)


def pipeline_runs(out: Path) -> list[Path]:
    """The sample folder loaded, cleaned, split and stored, observed twice."""
    from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader
    from langchain_core.embeddings import DeterministicFakeEmbedding
    from langchain_core.vectorstores import InMemoryVectorStore
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    import complydoc as cd

    class OpenAIEmbeddings(DeterministicFakeEmbedding):
        """Stands in for a hosted embedding model: looks up a host, embeds locally."""

        model: str = "text-embedding-3-small"

        def embed_documents(self, texts: list[str]) -> list[list[float]]:
            socket.getaddrinfo("localhost", 443)
            return super().embed_documents(texts)

    written = []
    for size, overlap, mask in ((400, 0, False), (1200, 120, True)):
        splitter = RecursiveCharacterTextSplitter(chunk_size=size, chunk_overlap=overlap)
        with cd.observe("contracts-ingest", out=out) as run:
            documents = DirectoryLoader(str(SAMPLE), glob="*.pdf", loader_cls=PyPDFLoader).load()
            documents = cd.StripPathMetadata().transform_documents(documents)
            if mask:
                documents = cd.MaskIdentifiers().transform_documents(documents)
            chunks = splitter.split_documents(documents)
            InMemoryVectorStore(OpenAIEmbeddings(size=1536)).add_documents(chunks)
        assert run.path is not None, run.error
        written.append(run.path)
    return written


def audit(out: Path) -> Path:
    """The sample folder audited, read a second way, with page pictures and its text."""
    import complydoc as cd

    report = cd.full_audit(
        SAMPLE, compare_extractors=["pypdf"], page_images=True, extracted_text=True, jobs=2
    )
    return cd.write_json(report, out / "complydoc.json", detail="full")


def chunks(out: Path) -> None:
    command = [sys.executable, "-m", "complydoc.cli", "chunks", str(SAMPLE), "--out", str(out)]
    for splitter in SPLITTERS:
        command += ["-s", splitter]
    subprocess.run(command, check=True, capture_output=True)


def shoot(url: str, png: Path) -> None:
    profile = tempfile.mkdtemp(prefix="complydoc-shots-")
    command = [
        str(CHROME),
        "--headless=new",
        f"--user-data-dir={profile}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "--hide-scrollbars",
        f"--window-size={WIDTH},{HEIGHT}",
        "--force-device-scale-factor=2",
        "--virtual-time-budget=8000",
        f"--screenshot={png}",
        url,
    ]
    chrome = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        # Chrome writes the picture and then sometimes lingers: it is stopped once the picture
        # has been written and stopped growing, or after a minute.
        deadline = time.monotonic() + 60
        size = -1
        while time.monotonic() < deadline and chrome.poll() is None:
            time.sleep(0.5)
            if png.exists() and png.stat().st_size == size:
                break
            size = png.stat().st_size if png.exists() else -1
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=10)
        except subprocess.TimeoutExpired:
            chrome.kill()
        shutil.rmtree(profile, ignore_errors=True)
    if not png.exists():
        raise SystemExit(f"Chrome made no screenshot of {url}")


def to_webp(png: Path, webp: Path) -> None:
    from PIL import Image

    with Image.open(png) as image:
        image.convert("RGB").save(webp, "WEBP", quality=82, method=6)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--keep", action="store_true", help="Keep the demo reports and PNGs.")
    arguments = parser.parse_args()
    if not CHROME.exists():
        raise SystemExit(f"Google Chrome is needed at {CHROME}")
    warnings.filterwarnings("ignore")

    import complydoc as cd
    from complydoc.report.json_reader import load_report

    work = Path(tempfile.mkdtemp(prefix="complydoc-demo-"))
    reports = work / "reports"
    print("building the demo reports")
    traces = pipeline_runs(reports / "trace")
    audited = audit(reports / "sample")
    chunks(reports / "sample")

    report = load_report(audited)
    # The document with the most found in it, and more than one page to show.
    contract = max(
        range(len(report.documents)),
        key=lambda i: (
            report.documents[i].page_count > 1,
            len(report.documents[i].sensitive.matches) if report.documents[i].sensitive else 0,
        ),
    )
    # The first document the two readers read differently, for the diff.
    differ = [
        i
        for i, d in enumerate(report.documents)
        if any(e.similarity < 0.9 for e in d.extractions[1:])
    ]
    diffed = differ[0] if differ else contract
    # The chunks run names a splitter by its class and settings.
    splitter = quote("RecursiveCharacterTextSplitter chunk_size=400 chunk_overlap=0")

    unmasked = traces[0].relative_to(reports).as_posix()
    shots = {
        "trace": (unmasked, "#pipeline?trace=open"),
        "document": ("sample/complydoc.json", f"#documents/{contract}?chunks={splitter}"),
        "diff": ("sample/complydoc.json", f"#documents/{diffed}"),
        "security": ("sample/complydoc.json", "#security"),
        "cost": ("sample/complydoc.json", "#cost"),
    }

    viewer = cd.launch_ui(reports, port=0, open_browser=False)
    arguments.out.mkdir(parents=True, exist_ok=True)
    try:
        for name, (run, place) in shots.items():
            for theme in ("dark", "light"):
                png = work / f"{name}-{theme}.png"
                shoot(f"{viewer.url}?run={quote(run)}&theme={theme}{place}", png)
                target = arguments.out / f"{name}-{theme}.webp"
                to_webp(png, target)
                print(f"  {target.relative_to(ROOT)}  {target.stat().st_size / 1024:.0f} KB")
    finally:
        viewer.stop()
        if not arguments.keep:
            shutil.rmtree(work, ignore_errors=True)
        else:
            print(f"kept {work}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
