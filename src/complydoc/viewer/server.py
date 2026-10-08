"""Serve the report viewer and the reports in a folder, on this machine or to a team.

`complydoc ui` starts a small web server, opens the viewer in the browser, and
lists every report it finds, grouped by the folder each one audited or the
pipeline it traced, newest run first.

What the server does, and does not do:

- It listens on 127.0.0.1 unless told otherwise, so nothing on the network can
  reach it.
- It answers only requests addressed to this machine by name, so a web page
  elsewhere cannot use DNS rebinding to read the reports through it.
- Given another address to listen on (`--host`), it serves the reports to whoever
  can reach that address. It has no sign-in of its own, so it is then read-only
  unless told to allow edits, and it answers only to the names it is known by:
  the machine's own, and any given with `--allowed-host`.
- It serves the viewer's own files and the reports it found, nothing else. A
  report is asked for by an id the server gave it, never by a path.
- It writes two files, both beside the documents a report audited: the ignore
  file, when the viewer's own page sets a finding aside, and the concepts file,
  when it edits your own things to look for. A write must come from that page —
  same origin, JSON body — so another site open in the browser cannot make one.
  It writes `.complydoc-ignore.yaml` and `.complydoc-concepts.yaml` in the
  audited folder, or the file the run read if it is still a valid one, never any
  other file.
- Read-only, it writes no file at all.
- It makes no outbound connection, unless a source is a bucket folder
  (`s3://bucket/folder`): it then reads that bucket and nothing else. The viewer it
  serves makes none either.

Reports are found again on every request for the list, so a report written
while the server runs appears when the page is reloaded.
"""

from __future__ import annotations

import datetime as dt
import functools
import hashlib
import ipaddress
import json
import mimetypes
import shutil
import socket
import threading
import webbrowser
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from complydoc.storage import Mirror, remote_folder

__all__ = [
    "DEFAULT_PORT",
    "FoundReport",
    "ViewerNotBuiltError",
    "ViewerServer",
    "concepts_file_for",
    "find_reports",
    "ignore_file_for",
    "launch_ui",
]

DEFAULT_PORT = 8500
"""The first port tried. The next ones are tried in turn when it is taken."""

PORTS_TO_TRY = 20

HOST = "127.0.0.1"
"""Where the viewer listens unless given another address: this machine only."""

ANY_HOST = "*"
"""An allowed host that matches every name, for a server behind a proxy that checks it."""

DIST = Path(__file__).parent / "dist"
"""The built viewer. `make viewer-bundle` puts it here; a release wheel carries it."""

API = "api"

CONFIG_ELEMENT = "complydoc-local"

_KEPT = ("ignores", "concepts", "categories")
"""The files beside the documents that the viewer may read and change."""

_IGNORE_FIELDS = ("finding", "reason", "what", "paths", "until")
_CONCEPT_FIELDS = ("id", "label", "description", "pattern", "severity", "judge")
_CATEGORY_FIELDS = ("enabled", "severity")
"""What the viewer may set; who made a change, and when, is the server's to say."""
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


@dataclass(frozen=True)
class _Known:
    """What the server needs of a report, read from it once per version of the file."""

    schema_version: int | None
    target: str
    read: dict[str, str | None]
    """The ignore and concepts files the run read, by kind, where it read one."""


_cache: dict[tuple[Path, int, float], _Known | None] = {}
_cache_lock = threading.Lock()
_parse_lock = threading.Lock()
"""One report parsed at a time: a large one takes gigabytes while it is, and the viewer's
first requests arrive together."""


def _known(path: Path, size: int, modified: float) -> _Known | None:
    """What the server needs of a report, or None when the file is not one.

    A folder of reports also holds routing manifests, diffs and chunk reports.
    Only an audit report has a `run` with a schema version and a list of
    documents, so that is what is looked for. The answer is kept per file
    version, so a report is parsed once, not on every request.
    """
    key = (path, size, modified)
    with _cache_lock:
        if key in _cache:
            return _cache[key]
    with _parse_lock:
        with _cache_lock:
            if key in _cache:
                return _cache[key]
        result: _Known | None = None
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
                read = {
                    kind: file
                    if isinstance(file := (data.get(kind) or {}).get("file"), str)
                    else None
                    for kind in _KEPT
                }
                result = _Known(
                    version if isinstance(version, int) else None,
                    str(run.get("target") or ""),
                    read,
                )
        del data
        with _cache_lock:
            _cache[key] = result
    return result


def _identify(path: Path, size: int, modified: float) -> tuple[int | None, str] | None:
    """The schema version and audited folder of a report, or None when it is not one."""
    known = _known(path, size, modified)
    return None if known is None else (known.schema_version, known.target)


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
            # A report's `.parts` folder holds what is kept out of it, never a report.
            candidates = [
                (path, root)
                for path in sorted(root.rglob("*.json"))
                if not any(part.endswith(".parts") for part in path.relative_to(root).parts[:-1])
            ]
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


@functools.lru_cache(maxsize=1)
def _shipped_config() -> Any:
    """The settings complydoc ships, read once: the categories the viewer lists and edits."""
    from complydoc.config.loader import load_config

    return load_config()


def _file_for(report_path: Path, kind: str) -> Path | None:
    """The file of this `kind` (`ignores`, `concepts` or `categories`) that a report's folder
    keeps, or None.

    The one the run read, when it is still there and still valid, else the file
    of that kind at the top of the folder the report audited. None when that
    folder is not on this machine.
    """
    from complydoc.categories import CATEGORIES_FILENAME, CategoryError, load_categories
    from complydoc.concepts import CONCEPTS_FILENAME, ConceptError, load_concepts
    from complydoc.ignores import IGNORE_FILENAME, IgnoreError, load_ignores

    filename, load, error = {
        "ignores": (IGNORE_FILENAME, load_ignores, IgnoreError),
        "concepts": (CONCEPTS_FILENAME, load_concepts, ConceptError),
        "categories": (CATEGORIES_FILENAME, load_categories, CategoryError),
    }[kind]
    try:
        stat = report_path.stat()
    except OSError:
        return None
    known = _known(report_path, stat.st_size, stat.st_mtime)
    if known is None:
        return None
    read = known.read.get(kind)
    if isinstance(read, str) and read.endswith((".yaml", ".yml")) and Path(read).is_file():
        try:
            load(Path(read))
            return Path(read)
        except error:
            pass
    target = Path(known.target)
    if not target.is_absolute():
        return None
    folder = target if target.is_dir() else target.parent
    return folder / filename if folder.is_dir() else None


def ignore_file_for(report_path: Path) -> Path | None:
    """The ignore file a finding in this report is set aside in, or None."""
    return _file_for(report_path, "ignores")


def concepts_file_for(report_path: Path) -> Path | None:
    """The concepts file the folder this report audited keeps, or None."""
    return _file_for(report_path, "concepts")


def is_loopback(host: str) -> bool:
    """Whether `host` is an address only this machine can reach."""
    if host.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host.strip("[]")).is_loopback
    except ValueError:
        return False


def _is_address(name: str) -> bool:
    """Whether `name` is an address, not a name.

    A request to an address needs no check: a rebinding page reaches this server under
    its own name, and a page at an address is this server's own or cannot read the answer.
    """
    try:
        ipaddress.ip_address(name)
    except ValueError:
        return False
    return True


def _name_of(header: str) -> str:
    """The host a `Host` header or an origin names, without its port: `[::1]:8500` is `::1`."""
    host = header.strip().lower()
    if host.startswith("["):
        return host[1:].partition("]")[0]
    return host.rpartition(":")[0] if ":" in host else host


def served_names(host: str, allowed: tuple[str, ...] = ()) -> frozenset[str]:
    """The names a viewer listening on `host` answers to.

    This machine's own names, and the ones in `allowed`; a request to an address is
    answered whatever the address. A request that names any other host is refused,
    which is what stops a page elsewhere from reading the reports through a browser
    inside the network.
    """
    names = {"localhost", "127.0.0.1", "::1", host.strip("[]").lower()}
    names.update(name.strip("[]").lower() for name in allowed)
    try:
        hostname = socket.gethostname()
        names.update({hostname.lower(), socket.getfqdn().lower()})
        names.update(address.lower() for address in socket.gethostbyname_ex(hostname)[2])
    except OSError:
        pass
    names.discard("")
    return frozenset(names)


def _index_html(dist: Path, sources: list[str], read_only: bool = False) -> bytes:
    """The viewer's page, told where the reports are and whether it may change files."""
    page = (dist / "index.html").read_text(encoding="utf-8")
    config = json.dumps({"reports": f"{API}/reports", "sources": sources, "readOnly": read_only})
    # `</` cannot close the script element from inside the JSON.
    config = config.replace("</", "<\\/")
    element = f'<script type="application/json" id="{CONFIG_ELEMENT}">{config}</script>'
    return page.replace("</head>", f"    {element}\n  </head>", 1).encode("utf-8")


class _Handler(BaseHTTPRequestHandler):
    server: _Server

    def log_message(self, format: str, *args: Any) -> None:
        """Quiet: the terminal shows the address, not every request."""

    def _local_host(self) -> bool:
        """Whether the request names this server, which a rebinding page cannot fake."""
        host = (self.headers.get("Host") or "").strip().lower()
        port = self.server.server_address[1]
        if self.server.names is None:
            return host in {f"127.0.0.1:{port}", f"localhost:{port}", f"[::1]:{port}"}
        # Served to others, the port a reader names may be a proxy's or a container's.
        name = _name_of(host)
        return ANY_HOST in self.server.names or name in self.server.names or _is_address(name)

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

    def _refusal(self) -> str:
        """Why a request to another name was refused, and what would let it through."""
        if self.server.names is None:
            return "complydoc ui answers requests to this machine only"
        asked = _name_of(self.headers.get("Host") or "") or "no host"
        return (
            f"complydoc ui does not answer to {asked}. If that is a name for this server, "
            f"start it with --allowed-host {asked}"
        )

    def _same_origin(self) -> bool:
        """Whether a write came from the viewer's own page.

        A page elsewhere can send a form to this port, and the Host check alone
        lets it through, since the browser names this machine for it. A JSON body
        makes the browser ask first, which this server never answers, and the
        Origin says who is asking.
        """
        port = self.server.server_address[1]
        origin = (self.headers.get("Origin") or "").strip().lower()
        content_type = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if content_type != "application/json":
            return False
        if self.server.names is None:
            return origin in {
                f"http://127.0.0.1:{port}",
                f"http://localhost:{port}",
                f"http://[::1]:{port}",
            }
        # The page that sent it must be the one this request is addressed to.
        scheme, _, named = origin.partition("://")
        return scheme in {"http", "https"} and named == (self.headers.get("Host") or "").lower()

    def _json(self, status: HTTPStatus, data: Any) -> None:
        self._send(status, json.dumps(data).encode("utf-8"), "application/json")

    def _kept_file(self, path: str) -> tuple[str, Path] | None:
        """What a `/api/reports/{id}/ignores` or `/concepts` path names: the kind, and its file."""
        wanted, _, kind = path.removeprefix(f"/{API}/reports/").partition("/")
        if kind not in _KEPT:
            return None
        report = next((r for r in find_reports(*self.server.sources) if r.id == wanted), None)
        file = _file_for(report.path, kind) if report is not None else None
        return None if file is None else (kind, file)

    def _listing(self, kind: str, file: Path) -> None:
        from complydoc.categories import effective, load_categories
        from complydoc.concepts import load_concepts
        from complydoc.ignores import load_ignores

        if kind == "categories":
            config = _shipped_config()
            given = load_categories(file)
            self._json(
                HTTPStatus.OK,
                {
                    "file": str(file),
                    "categories": effective(config, given),
                    "unknown": sorted(
                        n for n in given.categories if n not in config.sensitive.categories
                    ),
                },
            )
            return
        if kind == "ignores":
            entries = [entry.model_dump(mode="json") for entry in load_ignores(file).ignores]
        else:
            entries = [c.model_dump(mode="json") for c in load_concepts(file).concepts]
        self._json(HTTPStatus.OK, {"file": str(file), kind: entries})

    def _write(self) -> None:
        """Change the ignore, concepts or categories file, for the viewer's own page only."""
        from complydoc.categories import (
            CategoryChange,
            CategoryError,
            reset_category,
            save_category,
        )
        from complydoc.concepts import Concept, ConceptError, remove_concept, save_concept
        from complydoc.ignores import IgnoreEntry, IgnoreError, add_ignore, remove_ignore, who

        if self.server.read_only:
            self._error(HTTPStatus.FORBIDDEN, "this viewer is read-only")
            return
        if not self._local_host() or not self._same_origin():
            self._error(HTTPStatus.FORBIDDEN, "only the viewer's own page can change these files")
            return
        found = self._kept_file(unquote(urlsplit(self.path).path))
        if found is None:
            self._error(HTTPStatus.NOT_FOUND, "no such report, or its folder is gone")
            return
        kind, file = found
        try:
            length = min(int(self.headers.get("Content-Length") or 0), 64_000)
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("expected an object")
            given = {key: value for key, value in body.items() if value not in (None, "")}
            if kind == "ignores" and self.command == "DELETE":
                remove_ignore(file, str(body.get("finding", "")))
            elif kind == "ignores":
                add_ignore(
                    file,
                    IgnoreEntry.model_validate(
                        {key: given[key] for key in _IGNORE_FIELDS if key in given}
                        | {"by": who(), "added": dt.date.today()}
                    ),
                )
            elif kind == "categories" and self.command == "DELETE":
                reset_category(file, str(body.get("id", "")))
            elif kind == "categories":
                from complydoc.config.loader import load_config

                change = {key: given[key] for key in _CATEGORY_FIELDS if key in given}
                save_category(
                    file,
                    str(body.get("id", "")),
                    CategoryChange.model_validate(change),
                    load_config(),
                )
            elif self.command == "DELETE":
                remove_concept(file, str(body.get("id", "")))
            else:
                concept = {key: given[key] for key in _CONCEPT_FIELDS if key in given}
                save_concept(file, Concept.model_validate(concept))
        except (IgnoreError, ConceptError, CategoryError, ValueError, OSError) as exc:
            self._error(HTTPStatus.BAD_REQUEST, str(exc))
            return
        self._listing(kind, file)

    def do_POST(self) -> None:
        self._write()

    def do_DELETE(self) -> None:
        self._write()

    def do_GET(self) -> None:
        if not self._local_host():
            self._error(HTTPStatus.FORBIDDEN, self._refusal())
            return
        path = unquote(urlsplit(self.path).path)
        server = self.server
        server.refresh()
        if path in {"/", "/index.html"}:
            self._send(
                HTTPStatus.OK,
                _index_html(server.dist, server.source_names, server.read_only),
                "text/html; charset=utf-8",
            )
        elif path == f"/{API}/health":
            # For whatever keeps the server running to ask: it is up, and can read its folders.
            from complydoc import __version__

            self._json(
                HTTPStatus.OK,
                {
                    "status": "ok",
                    "version": __version__,
                    "reports": len(find_reports(*server.sources)),
                    "read_only": server.read_only,
                    # A bucket that could not be read: the reports copied earlier are still served.
                    "storage_errors": [m.error for m in server.mirrors if m.error],
                },
            )
        elif path == f"/{API}/reports":
            reports = [report.to_dict() for report in find_reports(*server.sources)]
            body = json.dumps({"reports": reports, "sources": server.source_names}).encode("utf-8")
            self._send(HTTPStatus.OK, body, "application/json")
        elif path.startswith(f"/{API}/reports/") and path.endswith(tuple(f"/{k}" for k in _KEPT)):
            found = self._kept_file(path)
            if found is None:
                self._error(HTTPStatus.NOT_FOUND, "no such report, or its folder is gone")
                return
            try:
                self._listing(*found)
            except ValueError as exc:
                self._error(HTTPStatus.CONFLICT, str(exc))
        elif path.startswith(f"/{API}/reports/") and "/files/" in path:
            self._part(path)
        elif path.startswith(f"/{API}/reports/"):
            wanted = path.removeprefix(f"/{API}/reports/")
            report = next((r for r in find_reports(*server.sources) if r.id == wanted), None)
            if report is None:
                self._error(HTTPStatus.NOT_FOUND, "no such report")
                return
            self._report(report)
        else:
            self._static(path)

    def _part(self, path: str) -> None:
        """A file kept beside a report, such as a page picture, and only from the report's
        own `.parts` folder."""
        from complydoc.report.json_writer import parts_folder

        wanted, _, name = path.removeprefix(f"/{API}/reports/").partition("/files/")
        report = next((r for r in find_reports(*self.server.sources) if r.id == wanted), None)
        if report is None:
            self._error(HTTPStatus.NOT_FOUND, "no such report")
            return
        folder = parts_folder(report.path).resolve()
        file = (report.path.parent / name).resolve()
        if not file.is_relative_to(folder):
            self._error(HTTPStatus.NOT_FOUND, "no such file in this report")
            return
        if not file.is_file() and not self.server.fetch(file):
            self._error(HTTPStatus.NOT_FOUND, "no such file in this report")
            return
        stat = file.stat()
        content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        self._file(file, stat.st_size, stat.st_mtime, content_type)

    def _report(self, report: FoundReport) -> None:
        self._file(report.path, report.size, report.modified, "application/json")

    def _file(self, file: Path, size: int, modified: float, content_type: str) -> None:
        """A file streamed from disk rather than read whole, and not sent again to a
        browser that already holds this version of it."""
        tag = f'"{size:x}-{int(modified * 1e6):x}"'
        if self.headers.get("If-None-Match") == tag:
            self.send_response(HTTPStatus.NOT_MODIFIED)
            self.send_header("ETag", tag)
            self.end_headers()
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(size))
        self.send_header("ETag", tag)
        # Kept, but asked after each time: a report rewritten in place is seen at once.
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        if self.command == "HEAD":
            return
        with file.open("rb") as stream:
            shutil.copyfileobj(stream, self.wfile, 1 << 20)

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

    def refresh(self) -> None:
        """Bring the reports of each bucket folder up to date, when it is time to look."""
        for mirror in self.mirrors:
            mirror.refresh()

    def fetch(self, file: Path) -> bool:
        """Copy down a report's part that is still only in its bucket."""
        return any(mirror.holds(file) and mirror.fetch(file) for mirror in self.mirrors)

    def __init__(
        self,
        port: int,
        sources: list[Path],
        dist: Path,
        host: str = HOST,
        read_only: bool = False,
        allowed_hosts: tuple[str, ...] = (),
    ) -> None:
        self.sources = sources
        self.source_names = [str(source) for source in sources]
        self.mirrors: list[Mirror] = []
        self.dist = dist
        self.host = host
        self.read_only = read_only
        # None while only this machine can reach it: the stricter check, port and all.
        self.names = None if is_loopback(host) else served_names(host, allowed_hosts)
        if ":" in host:
            self.address_family = socket.AF_INET6
        super().__init__((host, port), _Handler)


class ViewerServer:
    """A running viewer. `url` is where it is; `stop()` ends it."""

    def __init__(self, server: _Server) -> None:
        self._server = server
        self._thread: threading.Thread | None = None

    @property
    def port(self) -> int:
        return int(self._server.server_address[1])

    @property
    def host(self) -> str:
        return self._server.host

    @property
    def read_only(self) -> bool:
        """Whether the viewer may change the ignore, concepts and categories files."""
        return self._server.read_only

    @property
    def shared(self) -> bool:
        """Whether anything but this machine can reach it."""
        return self._server.names is not None

    @property
    def url(self) -> str:
        """Where to open it: by this machine's name when it listens on every address."""
        host = self.host
        if host in {"0.0.0.0", "::"}:
            host = socket.gethostname() or "localhost"
        return f"http://{f'[{host}]' if ':' in host else host}:{self.port}/"

    def reports(self) -> list[FoundReport]:
        """The reports the viewer lists right now."""
        self._server.refresh()
        return find_reports(*self._server.sources)

    @property
    def storage_errors(self) -> list[str]:
        """Why a bucket folder could not be read, for each that could not."""
        return [mirror.error for mirror in self._server.mirrors if mirror.error]

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
        for mirror in self._server.mirrors:
            mirror.close()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def __repr__(self) -> str:
        return f"<complydoc viewer at {self.url}>"

    def _repr_html_(self) -> str:
        return f'complydoc viewer: <a href="{self.url}" target="_blank">{self.url}</a>'


def _bind(
    port: int,
    sources: list[Path],
    dist: Path,
    host: str = HOST,
    read_only: bool = False,
    allowed_hosts: tuple[str, ...] = (),
) -> _Server:
    """A server on `port`, or on the next free one. Port 0 lets the system choose."""
    last: OSError | None = None
    for candidate in [0] if port == 0 else range(port, port + PORTS_TO_TRY):
        try:
            return _Server(candidate, sources, dist, host, read_only, allowed_hosts)
        except OSError as exc:
            last = exc
    raise OSError(f"no free port from {port} to {port + PORTS_TO_TRY - 1} on {host}") from last


def launch_ui(
    *sources: str | Path,
    port: int = DEFAULT_PORT,
    open_browser: bool = True,
    block: bool = False,
    dist: Path | None = None,
    host: str = HOST,
    read_only: bool | None = None,
    allowed_hosts: tuple[str, ...] | list[str] = (),
) -> ViewerServer:
    """Open the report viewer on the reports in `sources`, served from this machine.

    `sources` are report files or folders to search, `.complydoc` when none is
    given. The server listens on 127.0.0.1 only and makes no outbound
    connection. A source may also be a bucket folder, `s3://bucket/folder`, which
    is the one case where it does: it copies that folder's reports here to serve
    them, and looks again as the page is reloaded. With `block=False`, the
    default, it runs in the background and the returned server's `stop()` ends
    it, which is what a notebook wants.

    `host` is the address to listen on. Any but this machine's own serves the
    reports to whoever can reach it, with no sign-in, so the viewer is then
    read-only unless `read_only=False` says otherwise. It answers only to this
    machine's names and to `allowed_hosts`: the name a proxy serves it under goes
    there, and `"*"` accepts every name.
    """
    dist = dist or DIST
    if not (dist / "index.html").is_file():
        raise ViewerNotBuiltError(dist)
    # A bucket folder, `s3://bucket/folder`, is served from a copy of its reports kept here.
    mirrors: list[Mirror] = []
    folders: list[Path] = []
    names: list[str] = []
    for source in sources or (".complydoc",):
        remote = remote_folder(source)
        if remote is None:
            folders.append(Path(source).expanduser().resolve())
            names.append(str(folders[-1]))
        else:
            mirrors.append(Mirror.of(remote))
            folders.append(mirrors[-1].folder)
            names.append(str(remote))
    if read_only is None:
        read_only = not is_loopback(host)
    try:
        server = _bind(port, folders, dist, host, read_only, tuple(allowed_hosts))
    except OSError:
        for mirror in mirrors:
            mirror.close()
        raise
    server.source_names = names
    server.mirrors = mirrors
    viewer = ViewerServer(server)
    if open_browser:
        webbrowser.open(viewer.url)
    if block:
        viewer.serve_forever()
        return viewer
    return viewer.start()
