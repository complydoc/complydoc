"""Serve the report viewer and the reports in a folder, on this machine only.

`complydoc ui` is to a folder of reports what `mlflow ui` is to a folder of runs:
it starts a small web server, opens the viewer in the browser, and lists every
report it finds, grouped by the folder each one audited, newest run first.

What the server does, and does not do:

- It listens on 127.0.0.1, so nothing on the network can reach it.
- It answers only requests addressed to this machine by name, so a web page
  elsewhere cannot use DNS rebinding to read the reports through it.
- It serves the viewer's own files and the reports it found, nothing else. A
  report is asked for by an id the server gave it, never by a path.
- It makes no outbound connection. The viewer it serves makes none either.

Reports are found again on every request for the list, so a report written
while the server runs appears when the page is reloaded.
"""

from __future__ import annotations

import hashlib
import json
import mimetypes
import threading
import webbrowser
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

__all__ = [
    "DEFAULT_PORT",
    "FoundReport",
    "ViewerNotBuiltError",
    "ViewerServer",
    "find_reports",
    "launch_ui",
]

DEFAULT_PORT = 8500
"""The first port tried. The next ones are tried in turn when it is taken."""

PORTS_TO_TRY = 20

HOST = "127.0.0.1"

DIST = Path(__file__).parent / "dist"
"""The built viewer. `make viewer-bundle` puts it here; a release wheel carries it."""

API = "api"

CONFIG_ELEMENT = "complydoc-local"
"""The id of the script element that tells the viewer where to find the reports."""


class ViewerNotBuiltError(RuntimeError):
    """This installation has no built viewer, as in a checkout that never built it."""

    def __init__(self, dist: Path) -> None:
        super().__init__(
            f"the viewer is not built into this installation ({dist} is missing). "
            "In a checkout of complydoc, run `make viewer-bundle`; a release wheel carries it."
        )


@dataclass(frozen=True)
class FoundReport:
    """A report JSON file found in a folder."""

    id: str
    """Stable for a path, so a reloaded page asks for the same report."""
    path: Path
    name: str
    """The path the viewer shows: relative to the folder it was found in."""
    size: int
    modified: float
    schema_version: int | None
    target: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "size": self.size,
            "modified": self.modified,
            "schema_version": self.schema_version,
            "target": self.target,
            "url": f"{API}/reports/{self.id}",
        }


_cache: dict[tuple[Path, int, float], tuple[int | None, str] | None] = {}
_cache_lock = threading.Lock()


def _identify(path: Path, size: int, modified: float) -> tuple[int | None, str] | None:
    """The schema version and audited folder of a report, or None when it is not one.

    A folder of reports also holds routing manifests, diffs and chunk reports.
    Only an audit report has a `run` with a schema version and a list of
    documents, so that is what is looked for. The answer is kept per file
    version, so a large report is parsed once, not on every reload.
    """
    key = (path, size, modified)
    with _cache_lock:
        if key in _cache:
            return _cache[key]
    result: tuple[int | None, str] | None = None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValueError):
        data = None
    if isinstance(data, dict):
        run = data.get("run")
        if (
            isinstance(run, dict)
            and "schema_version" in run
            and isinstance(data.get("documents"), list)
        ):
            version = run.get("schema_version")
            result = (version if isinstance(version, int) else None, str(run.get("target") or ""))
    with _cache_lock:
        _cache[key] = result
    return result


def _report_id(path: Path) -> str:
    return hashlib.sha256(str(path).encode("utf-8")).hexdigest()[:16]


def find_reports(*sources: str | Path) -> list[FoundReport]:
    """Every audit report in `sources`, each a report file or a folder searched below.

    Newest first. A file that is not an audit report, such as a routing manifest,
    is left out.
    """
    found: dict[Path, FoundReport] = {}
    for source in sources or (Path(".complydoc"),):
        root = Path(source).expanduser().resolve()
        if root.is_file():
            candidates = [(root, root.parent)]
        elif root.is_dir():
            candidates = [(path, root) for path in sorted(root.rglob("*.json"))]
        else:
            continue
        for path, base in candidates:
            if path in found:
                continue
            try:
                stat = path.stat()
            except OSError:
                continue
            identified = _identify(path, stat.st_size, stat.st_mtime)
            if identified is None:
                continue
            schema_version, target = identified
            found[path] = FoundReport(
                id=_report_id(path),
                path=path,
                name=path.relative_to(base).as_posix(),
                size=stat.st_size,
                modified=stat.st_mtime,
                schema_version=schema_version,
                target=target,
            )
    return sorted(found.values(), key=lambda report: report.modified, reverse=True)


def _index_html(dist: Path, sources: list[str]) -> bytes:
    """The viewer's page, told where the reports are."""
    page = (dist / "index.html").read_text(encoding="utf-8")
    config = json.dumps({"reports": f"{API}/reports", "sources": sources})
    # `</` cannot close the script element from inside the JSON.
    config = config.replace("</", "<\\/")
    element = f'<script type="application/json" id="{CONFIG_ELEMENT}">{config}</script>'
    return page.replace("</head>", f"    {element}\n  </head>", 1).encode("utf-8")


class _Handler(BaseHTTPRequestHandler):
    server: _Server

    def log_message(self, format: str, *args: Any) -> None:
        """Quiet: the terminal shows the address, not every request."""

    def _local_host(self) -> bool:
        """Whether the request names this machine, which a rebinding page cannot fake."""
        host = (self.headers.get("Host") or "").strip().lower()
        port = self.server.server_address[1]
        return host in {f"127.0.0.1:{port}", f"localhost:{port}", f"[::1]:{port}"}

    def _send(
        self, status: HTTPStatus, body: bytes, content_type: str, cache: bool = False
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "max-age=3600" if cache else "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _error(self, status: HTTPStatus, message: str) -> None:
        self._send(status, message.encode("utf-8"), "text/plain; charset=utf-8")

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        if not self._local_host():
            self._error(HTTPStatus.FORBIDDEN, "complydoc ui answers requests to this machine only")
            return
        path = unquote(urlsplit(self.path).path)
        server = self.server
        if path in {"/", "/index.html"}:
            self._send(
                HTTPStatus.OK,
                _index_html(server.dist, server.source_names),
                "text/html; charset=utf-8",
            )
        elif path == f"/{API}/reports":
            reports = [report.to_dict() for report in find_reports(*server.sources)]
            body = json.dumps({"reports": reports, "sources": server.source_names}).encode("utf-8")
            self._send(HTTPStatus.OK, body, "application/json")
        elif path.startswith(f"/{API}/reports/"):
            wanted = path.removeprefix(f"/{API}/reports/")
            report = next((r for r in find_reports(*server.sources) if r.id == wanted), None)
            if report is None:
                self._error(HTTPStatus.NOT_FOUND, "no such report")
                return
            self._send(HTTPStatus.OK, report.path.read_bytes(), "application/json")
        else:
            self._static(path)

    def _static(self, path: str) -> None:
        """One of the viewer's own files, and only those."""
        dist = self.server.dist.resolve()
        file = (dist / path.lstrip("/")).resolve()
        if not file.is_relative_to(dist) or not file.is_file():
            self._error(HTTPStatus.NOT_FOUND, "not found")
            return
        content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        # Built assets carry a hash in their name, so they can be cached.
        self._send(
            HTTPStatus.OK, file.read_bytes(), content_type, cache=file.parent.name == "assets"
        )


class _Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port: int, sources: list[Path], dist: Path) -> None:
        self.sources = sources
        self.source_names = [str(source) for source in sources]
        self.dist = dist
        super().__init__((HOST, port), _Handler)


class ViewerServer:
    """A running viewer. `url` is where it is; `stop()` ends it."""

    def __init__(self, server: _Server) -> None:
        self._server = server
        self._thread: threading.Thread | None = None

    @property
    def port(self) -> int:
        return int(self._server.server_address[1])

    @property
    def url(self) -> str:
        return f"http://{HOST}:{self.port}/"

    def reports(self) -> list[FoundReport]:
        """The reports the viewer lists right now."""
        return find_reports(*self._server.sources)

    def serve_forever(self) -> None:
        """Serve until interrupted, in this thread."""
        try:
            self._server.serve_forever()
        finally:
            self._server.server_close()

    def start(self) -> ViewerServer:
        """Serve in a background thread, as a notebook needs."""
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    def wait(self) -> None:
        """Block until the server stops. Ctrl+C interrupts it, since it waits in short steps."""
        while self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=0.5)

    def stop(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def __repr__(self) -> str:
        return f"<complydoc viewer at {self.url}>"

    def _repr_html_(self) -> str:
        return f'complydoc viewer: <a href="{self.url}" target="_blank">{self.url}</a>'


def _bind(port: int, sources: list[Path], dist: Path) -> _Server:
    """A server on `port`, or on the next free one. Port 0 lets the system choose."""
    last: OSError | None = None
    for candidate in [0] if port == 0 else range(port, port + PORTS_TO_TRY):
        try:
            return _Server(candidate, sources, dist)
        except OSError as exc:
            last = exc
    raise OSError(f"no free port from {port} to {port + PORTS_TO_TRY - 1}") from last


def launch_ui(
    *sources: str | Path,
    port: int = DEFAULT_PORT,
    open_browser: bool = True,
    block: bool = False,
    dist: Path | None = None,
) -> ViewerServer:
    """Open the report viewer on the reports in `sources`, served from this machine.

    `sources` are report files or folders to search, `.complydoc` when none is
    given. The server listens on 127.0.0.1 only and makes no outbound
    connection. With `block=False`, the default, it runs in the background and
    the returned server's `stop()` ends it, which is what a notebook wants.
    """
    dist = dist or DIST
    if not (dist / "index.html").is_file():
        raise ViewerNotBuiltError(dist)
    folders = [Path(source).expanduser().resolve() for source in (sources or (".complydoc",))]
    viewer = ViewerServer(_bind(port, folders, dist))
    if open_browser:
        webbrowser.open(viewer.url)
    if block:
        viewer.serve_forever()
        return viewer
    return viewer.start()
