"""Check the built viewer in a real browser, on demo reports made for the purpose.

    make viewer-bundle
    uv run --group integrations python viewer/scripts/browser_check.py

Builds a pipeline observed six times, since a table of more than five runs can be sorted
and a sorted table is where a rendering loop once hid, and an audit of the sample folder
with page pictures. Serves them with `complydoc ui` on a free port and runs
`browser-check.mjs` against it, which fails on a page that stops answering or a control
that something covers. Nothing is sent anywhere: the pipeline's embedding model is a
stand-in, and the browser has a profile of its own.
"""

from __future__ import annotations

import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "src" / "complydoc" / "sample"
PIPELINE = "contracts-ingest"
RUNS = 6


def build_reports(out: Path) -> None:
    from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader
    from langchain_core.embeddings import DeterministicFakeEmbedding
    from langchain_core.vectorstores import InMemoryVectorStore
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    import complydoc as cd

    for run in range(RUNS):
        splitter = RecursiveCharacterTextSplitter(chunk_size=400 + 100 * run, chunk_overlap=0)
        with cd.observe(PIPELINE, out=out) as observed:
            documents = DirectoryLoader(str(SAMPLE), glob="*.pdf", loader_cls=PyPDFLoader).load()
            chunks = splitter.split_documents(documents)
            InMemoryVectorStore(DeterministicFakeEmbedding(size=64)).add_documents(chunks)
        assert observed.path is not None, observed.error
        # Runs are named by the second they started in.
        time.sleep(1.05)
    report = cd.full_audit(SAMPLE, page_images=True, extracted_text=True, jobs=1)
    cd.write_json(report, out / "complydoc.json", detail="full")


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="complydoc-browser-check-") as folder:
        reports = Path(folder)
        print("building the demo reports", flush=True)
        build_reports(reports)
        port = free_port()
        url = f"http://127.0.0.1:{port}/"
        server = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "complydoc.cli",
                "ui",
                str(reports),
                "--port",
                str(port),
                "--no-browser",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            for _ in range(100):
                try:
                    with urllib.request.urlopen(url, timeout=1):
                        break
                except OSError:
                    time.sleep(0.2)
            else:
                print("complydoc ui did not start", file=sys.stderr)
                return 1
            print(f"checking {url} in a real browser", flush=True)
            script = Path(__file__).with_name("browser-check.mjs")
            return subprocess.run(["node", str(script), url, PIPELINE], check=False).returncode
        finally:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    raise SystemExit(main())
