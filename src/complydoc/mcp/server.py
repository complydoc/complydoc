"""The MCP server: JSON-RPC 2.0 over stdio, one message a line, no dependency beyond complydoc.

It offers an agent three kinds of thing, all worded for people who do not read reports:

- **Tools** (`catalogue.py`): find, search, check and open documents, check a whole folder,
  save a clean copy, and say or change which folders are shared. A folder is only added
  through the system's own folder dialog, clicked by the person. A masked value is shown
  only when the person allows it, in the client's own prompt (`request_unmask`).
- **Resources**: every shared document, which a client can offer in its attach menu; what
  is attached is the clean text, never the file.
- **Prompts** (`prompts.py`): ready-made requests such as "check before sharing".

Only files inside the shared folders are read, the one place written to is the clean-copies
folder, and the network guard is armed for the whole session.
"""

from __future__ import annotations

import base64
import json
import subprocess
import sys
import unicodedata
from collections import deque
from collections.abc import Callable, Iterable, Iterator
from functools import cache
from importlib.resources import files
from pathlib import Path
from typing import IO, Any
from urllib.parse import quote, unquote, urlparse

from complydoc import __version__, offline
from complydoc.mcp import engines
from complydoc.mcp.catalogue import RUN_TOOLS, TOOLS
from complydoc.mcp.engines import Engine
from complydoc.mcp.folders import (
    INBOX,
    STORE,
    FilePicker,
    FolderError,
    Folders,
    Picker,
    pick_files,
    pick_folder,
)
from complydoc.mcp.prompts import PROMPTS, get_prompt
from complydoc.mcp.reading import CAREFUL, READY, STOP, UNREAD, Findings, Reader, short
from complydoc.mcp.runs import RunError, Runs
from complydoc.unmask import REVEAL_LOG, RevealLog, RevealRequest, UnmaskError

__all__ = ["CAREFUL", "READY", "STOP", "UNREAD", "Findings", "Server", "serve"]

PROTOCOL = "2025-06-18"
"""The protocol version offered when a client does not name one."""

MAX_LIST = 50
MAX_TEXT = 200_000
"""Characters of document text returned at most, so one huge file cannot flood a context."""
MAX_FOLDER = 200
"""Documents checked or searched at most in one call."""
MAX_HITS = 20
MAX_RESOURCES = 500

CLEAN_COPIES = Path.home() / "Downloads" / "complydoc clean copies"

SKIPPED_FOLDERS = frozenset(
    {"node_modules", ".venv", "venv", ".git", "__pycache__", ".complydoc", "dist", "build"}
)
"""Folders of code, tooling and build output, never of a person's documents: left out of every
listing."""

NO_FOLDER = (
    "No folder is shared with complydoc yet. Ask the person whether to choose one: "
    "choose_folder opens their computer's folder dialog."
)

SCHEME = "complydoc"
CHOSEN = "Chosen files"
"""The label of the files the person picked one by one."""


READS_DOCUMENTS = frozenset(
    {"check_document", "check_folder", "open_document", "save_clean_copy", "search_documents"}
)
"""The tools whose answer depends on names being masked."""


INSTRUCTIONS = (
    "Open documents with open_document, never by asking for the file: it masks "
    "personal details and removes hidden instructions before you read it. If a "
    "document is not in a shared folder, offer choose_file for one file, or choose_folder "
    "for its folder; open_latest opens the newest file in the Inbox folder. "
    "Masked values are numbered, as [#12 IBAN ••••4521]. Only if the task cannot be done "
    "without one, call request_unmask with its number and why: the person decides."
)
RUN_INSTRUCTIONS = (
    " For questions about ingestion pipelines, loaders, load times or evals, read the runs "
    "complydoc recorded with list_runs and show_run rather than the report files."
)


class ToolError(Exception):
    """Something the person can act on, returned to the client as the tool's answer."""


Ask = Callable[[str, dict[str, Any]], dict[str, Any] | None]
"""Puts a question to the person through the client (MCP elicitation) and gives its answer,
or None when there was none."""

NO_PROMPT = (
    "This app cannot show complydoc's approval prompt, so no masked value can be revealed "
    "here, and you cannot approve it on the person's behalf. Carry on without the value, or "
    "tell the person they can read it in the document themselves."
)


class Server:
    def __init__(
        self,
        folders: Folders,
        picker: Picker = pick_folder,
        clean_copies: Path = CLEAN_COPIES,
        file_picker: FilePicker = pick_files,
        fetching: subprocess.Popen[bytes] | None = None,
        runs: Runs | None = None,
        engine: Engine | None = None,
        config_dir: Path | None = None,
        reveals: Path | None = REVEAL_LOG,
    ) -> None:
        self.folders = folders
        self.log = RevealLog(reveals)
        """Every request to see a masked value, and the answer; never the value."""
        self.ask: Ask | None = None
        """How to ask the person, when the client said it can (elicitation)."""
        self.engine = engine
        """The engine documents are read with, when another package installed one."""
        self.config_dir = config_dir or (engine.config_dir if engine else None)
        self.runs = runs
        """The folders of recorded runs an engineer's tools read, when given."""
        self.picker = picker
        self.file_picker = file_picker
        self.clean_copies = clean_copies
        self.reader = Reader(self.config_dir)
        self.fetching = fetching
        """The name model being downloaded, until it is on disk."""
        self.fetch_failed = False

    def _names_pending(self) -> str | None:
        """What to say while the name model is not there yet; None once it is, or was never
        asked for. When the download ends, documents read without it are read again."""
        if self.fetching is not None and self.fetching.poll() is not None:
            self.fetch_failed = self.fetching.returncode != 0
            self.fetching = None
            if not self.fetch_failed:
                self.reader = Reader(self.config_dir)
        if self.fetching is not None:
            return (
                "Names of people and companies are not masked yet: complydoc is still "
                "downloading the model that finds them (about 700 MB, once). Say so to the person."
            )
        if self.fetch_failed:
            return (
                "Names of people and companies are not masked: the model that finds them could "
                "not be downloaded. Say so to the person."
            )
        return None

    # The files a person can name: "Contracts/acme.pdf", "acme.pdf", or a full path.
    def resolve(self, name: str) -> Path:
        name = name.strip()
        try:
            return self._resolve(name)
        except ToolError as first:
            # A name typed by a model is usually composed (NFC), while macOS may keep it
            # decomposed on disk: try the other spellings before saying there is none.
            for form in ("NFC", "NFD"):
                spelling = unicodedata.normalize(form, name)
                if spelling != name:
                    try:
                        return self._resolve(spelling)
                    except ToolError:
                        pass
            raise first

    def _resolve(self, name: str) -> Path:
        if not name:
            raise ToolError("Say which document: give its name as list_documents shows it.")
        if not self.folders.all and not self.folders.files:
            raise ToolError(NO_FOLDER)
        candidates: list[Path] = []
        given = Path(name).expanduser()
        if given.is_absolute():
            candidates.append(given.resolve())
        else:
            label, _, rest = name.partition("/")
            labels = self.folders.labels()
            if rest and label in labels:
                candidates.append((labels[label] / rest).resolve())
            candidates += [(folder / name).resolve() for folder in self.folders.all]
            candidates += [
                file for file in self.folders.files if name in (file.name, f"{CHOSEN}/{file.name}")
            ]
        for path in candidates:
            if path.is_file() and self.folders.contains(path):
                return path
        if any(path.is_file() for path in candidates) or ".." in Path(name).parts:
            raise ToolError(
                "That file is outside the folders the person shared. Ask whether to choose the "
                "folder it is in: choose_folder opens their computer's folder dialog."
            )
        matches = self.documents(Path(name).name)
        if len(matches) == 1:
            return self.resolve(matches[0])
        if matches:
            raise ToolError(f"Several documents match {name!r}: {', '.join(matches[:8])}.")
        raise ToolError(
            f"There is no document called {name!r} in the shared folders. If it is somewhere "
            "else, ask whether to choose the folder it is in with choose_folder."
        )

    def documents(self, query: str = "", folder: str = "") -> list[str]:
        """Every shared document as "folder/relative path", optionally narrowed."""
        from complydoc.audit.discovery import discover

        labels = self.folders.labels()
        if folder:
            if folder not in labels:
                raise ToolError(
                    f"No folder called {folder!r}. The folders are: {', '.join(labels)}."
                )
            labels = {folder: labels[folder]}
        names: list[str] = []
        for label, root in labels.items():
            found, _ = discover(root, recurse=True)
            names += sorted(
                f"{label}/{path.relative_to(root)}"
                for path in found
                if not SKIPPED_FOLDERS & set(path.relative_to(root).parts[:-1])
            )
        if not folder:
            names += sorted(f"{CHOSEN}/{file.name}" for file in self.folders.files)
        query = query.lower().strip()
        return [name for name in names if query in name.lower()] if query else names

    # The tools.
    def list_documents(self, query: str = "", page: object = 1) -> str:
        # A model sometimes writes a number as text: "2" is page 2.
        if isinstance(page, str) and page.strip().isdigit():
            page = int(page)
        if type(page) is not int or page < 1:
            raise ToolError("The page must be a positive integer, starting at 1.")
        if not self.folders.all:
            return NO_FOLDER
        names = self.documents(query)
        if not names:
            matching = f" matching {query!r}" if query else ""
            return f"No document{matching} in the shared folders."
        pages = (len(names) + MAX_LIST - 1) // MAX_LIST
        if page > pages:
            if pages == 1:
                return "There is only 1 page of documents; ask for page 1."
            return f"There are only {pages} pages of documents; ask for a page from 1 to {pages}."
        end = page * MAX_LIST
        shown = names[end - MAX_LIST : end]
        more = (
            f"\n…and {len(names) - end} more; ask for page {page + 1}, "
            "or narrow it with a word from the name."
            if end < len(names)
            else ""
        )
        return "\n".join(shown) + more

    def check_document(self, name: str) -> str:
        path = self.resolve(name)
        found = self.reader.read(path).findings
        head = f"{found.verdict}: {path.name}"
        if found.verdict == READY:
            return f"{head}\nNo personal or financial details and no hidden text were found."
        if found.verdict == UNREAD:
            return (
                f"{head}\nNothing in it was checked: {found.unread}. Do not treat it as safe "
                "to share; ask the person to check it themselves or to share it another way."
            )
        tail = "\nopen_document gives a copy with these masked or taken out, which is safe to use."
        return "\n".join([head, "Found:", *found.lines()]) + tail

    def check_folder(self, folder: str = "") -> str:
        if not self.folders.all:
            return NO_FOLDER
        names = self.documents(folder=folder)
        if not names:
            return "There are no documents to check."
        groups: dict[str, list[str]] = {STOP: [], CAREFUL: [], UNREAD: [], READY: []}
        unread: list[str] = []
        for name in names[:MAX_FOLDER]:
            try:
                found = self.reader.read(self.resolve(name)).findings
            except Exception:  # One unreadable file says so, and the rest are still checked.
                unread.append(name)
                continue
            line = name if found.verdict == READY else f"{name}: {found.summary()}"
            groups[found.verdict].append(line)
        where = f"in {folder}" if folder else "in the shared folders"
        said = [f"Checked {min(len(names), MAX_FOLDER)} documents {where}."]
        for verdict in (STOP, CAREFUL, UNREAD):
            if groups[verdict]:
                said += [
                    f"\n{verdict} ({len(groups[verdict])}):",
                    *(f"- {line}" for line in groups[verdict]),
                ]
        if groups[READY]:
            said.append(f"\n{READY} ({len(groups[READY])}): {', '.join(groups[READY])}")
        if unread:
            said.append(f"\nCould not be read ({len(unread)}): {', '.join(unread)}")
        if len(names) > MAX_FOLDER:
            said.append(f"\nOnly the first {MAX_FOLDER} of {len(names)} were checked.")
        return "\n".join(said)

    def search_documents(self, query: str, folder: str = "") -> str:
        words = [word.lower() for word in query.split()]
        if not words:
            raise ToolError("Say what to look for.")
        if not self.folders.all:
            return NO_FOLDER
        hits: list[str] = []
        names = self.documents(folder=folder)[:MAX_FOLDER]
        for name in names:
            try:
                reading = self.reader.read(self.resolve(name))
            except Exception:
                continue
            for page, text in reading.numbered_pages():
                lowered = text.lower()
                if all(word in lowered for word in words):
                    at = lowered.index(words[0])
                    hits.append(
                        f"- {name}, page {page}: “{short(text[max(0, at - 80) : at + 160])}”"
                    )
        if not hits:
            return f"No document mentions {query!r}."
        counted = "1 passage mentions" if len(hits) == 1 else f"{len(hits)} passages mention"
        return f"{counted} {query!r} (text already masked):\n" + _capped(
            hits, MAX_HITS, "make the search more precise"
        )

    def open_document(self, name: str) -> str:
        path = self.resolve(name)
        reading = self.reader.read(path)
        body = reading.text(numbered=True)
        cut = f" Only the first {MAX_TEXT:,} characters are shown." if len(body) > MAX_TEXT else ""
        return reading.note(path.name) + cut + "\n\n" + body[:MAX_TEXT]

    def save_clean_copy(self, name: str) -> str:
        path = self.resolve(name)
        reading = self.reader.read(path)
        self.clean_copies.mkdir(parents=True, exist_ok=True)
        target = self.clean_copies / f"{path.stem} (clean).txt"
        # Never over another copy: two documents can share a name in different folders.
        number = 2
        while target.exists():
            target = self.clean_copies / f"{path.stem} (clean {number}).txt"
            number += 1
        target.write_text(reading.text() + "\n", encoding="utf-8")
        return f"Saved a clean copy of {path.name} to {target}. " + reading.note(path.name).replace(
            f"complydoc read {path.name} for you. ", ""
        )

    def choose_file(self) -> str:
        files = self.file_picker("Choose the file or files complydoc may read")
        if not files:
            return "No file was chosen; nothing changed."
        added = [self.folders.add_file(file) for file in files]
        names = ", ".join(file.name for file in added)
        return (
            f"complydoc can read {names} for this conversation only. "
            "Open each with open_document, using its name."
        )

    def open_latest(self) -> str:
        from complydoc.audit.discovery import discover

        inbox = self.folders.inbox
        if inbox is None:
            raise ToolError("There is no Inbox folder in this session.")
        found, _ = discover(inbox, recurse=True)
        if not found:
            return (
                f"The Inbox folder is empty. Ask the person to drop a file in {inbox}, "
                "or to choose one with choose_file."
            )
        # A file dragged in keeps its old modification time, so when it arrived counts too.
        newest = max(found, key=lambda path: max(path.stat().st_mtime, path.stat().st_ctime))
        return self.open_document(f"{inbox.name}/{newest.relative_to(inbox)}")

    def request_unmask(self, name: str, number: object, reason: str) -> str:
        """One masked value, if the person allows it in the client's prompt."""
        path = self.resolve(name)
        reading = self.reader.read(path)
        try:
            wanted = int(str(number).lstrip("#"))
            span = reading.values.span(wanted)
        except ValueError as error:
            raise ToolError("Give the number of a masked value, such as 12 for [#12 …].") from error
        except UnmaskError as error:
            raise ToolError(str(error)) from error
        request = RevealRequest(span=span, reason=reason, source=str(path))
        if not span.revealable:
            self.log.record(request, "refused")
            raise ToolError(
                f"#{wanted} is a {span.label}, which complydoc never reveals. Carry on without it."
            )
        if self.ask is None:
            self.log.record(request, "unavailable")
            raise ToolError(NO_PROMPT)
        answer = self.ask(request.question(), {"type": "object", "properties": {}})
        allowed = answer is not None and answer.get("action") == "accept"
        self.log.record(request, "allowed" if allowed else "declined")
        if not allowed:
            return (
                f"The person declined to show #{wanted}. Carry on without it, and do not ask "
                "for it again unless they say so."
            )
        return (
            f"The person allowed you to see #{wanted} ({span.label}) in {path.name}: "
            f"{reading.values.value(wanted)}\nOnly this value was revealed."
        )

    # The resources.
    def resources(self, cursor: str | None) -> dict[str, Any]:
        names = self.documents() if self.folders.all else []
        start = int(cursor or 0)
        page = names[start : start + MAX_RESOURCES]
        listed = [
            {
                "uri": f"{SCHEME}:///{quote(name)}",
                "name": name,
                "title": Path(name).name,
                "description": "Read through complydoc: details masked, hidden text removed.",
                "mimeType": "text/plain",
            }
            for name in page
        ]
        result: dict[str, Any] = {"resources": listed}
        if start + MAX_RESOURCES < len(names):
            result["nextCursor"] = str(start + MAX_RESOURCES)
        return result

    def read_resource(self, uri: str) -> dict[str, Any]:
        parsed = urlparse(uri)
        if parsed.scheme != SCHEME:
            raise ToolError(f"Not a complydoc document: {uri}")
        path = self.resolve(unquote(parsed.path.lstrip("/")))
        reading = self.reader.read(path)
        text = reading.note(path.name) + "\n\n" + reading.text(numbered=True)[:MAX_TEXT]
        return {"contents": [{"uri": uri, "mimeType": "text/plain", "text": text}]}

    def call(self, name: str, arguments: dict[str, Any]) -> str:
        pending = self._names_pending()
        text = self._dispatch(name, arguments)
        if pending and name in READS_DOCUMENTS:
            text += "\n\n" + pending
        return text

    def instructions(self) -> str:
        said = INSTRUCTIONS
        if self.engine is not None:
            said += f" Personal details are found by {self.engine.name}, read through complydoc."
        return said + (RUN_INSTRUCTIONS if self.runs is not None else "")

    def tools(self) -> list[dict[str, Any]]:
        return TOOLS + RUN_TOOLS if self.runs is not None else TOOLS

    def _dispatch(self, name: str, arguments: dict[str, Any]) -> str:
        def argument(key: str) -> str:
            return str(arguments.get(key, ""))

        runs = self.runs
        if runs is not None:
            if name == "list_runs":
                return runs.list_runs(argument("query"))
            if name == "show_run":
                return runs.show_run(argument("run"))
            if name == "compare_runs":
                return runs.compare_runs(argument("run"), argument("against"))
            if name == "find_value":
                return runs.find_value(argument("value"))

        folders = self.folders
        if name == "list_documents":
            return self.list_documents(argument("query"), arguments.get("page", 1))
        if name == "search_documents":
            return self.search_documents(argument("query"), argument("folder"))
        if name == "check_document":
            return self.check_document(argument("path"))
        if name == "check_folder":
            return self.check_folder(argument("folder"))
        if name == "open_document":
            return self.open_document(argument("path"))
        if name == "save_clean_copy":
            return self.save_clean_copy(argument("path"))
        if name == "request_unmask":
            return self.request_unmask(argument("path"), arguments.get("id"), argument("reason"))
        if name == "list_folders":
            labels = folders.labels()
            if not labels:
                return NO_FOLDER
            return "complydoc can open documents from:\n" + "\n".join(
                f"- {label} ({path})" for label, path in labels.items()
            )
        if name == "choose_folder":
            chosen = self.picker("Choose a folder complydoc may open documents from")
            if chosen is None:
                return "No folder was chosen; nothing changed."
            label = folders.add(chosen)
            return f"complydoc can now open documents from {label} ({chosen})."
        if name == "choose_file":
            return self.choose_file()
        if name == "open_latest":
            return self.open_latest()
        if name == "remove_folder":
            removed = folders.remove(argument("name"))
            return f"complydoc no longer opens documents from {removed}."
        raise ToolError(f"No tool called {name!r}.")


def _capped(lines: list[str], limit: int, how: str) -> str:
    shown = lines[:limit]
    more = f"\n…and {len(lines) - len(shown)} more; {how}." if len(lines) > len(shown) else ""
    return "\n".join(shown) + more


@cache
def _icons() -> list[dict[str, Any]]:
    """The mark on its tile, for clients that show a server's icon beside its name."""
    here = files("complydoc.mcp")
    icons = []
    for name, mime, sizes in (
        ("icon.png", "image/png", ["128x128"]),
        ("icon.svg", "image/svg+xml", ["any"]),
    ):
        data = base64.b64encode(here.joinpath(name).read_bytes()).decode("ascii")
        icons.append({"src": f"data:{mime};base64,{data}", "mimeType": mime, "sizes": sizes})
    return icons


class _RequestError(Exception):
    """A request the protocol rejects, with its JSON-RPC error code."""

    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code


def _handle(
    server: Server, request: dict[str, Any], client: _Client | None = None
) -> dict[str, Any]:
    method = request.get("method")
    params = request.get("params") or {}
    if not isinstance(params, dict):
        raise _RequestError(-32602, "params must be an object")
    if method == "initialize":
        capabilities = params.get("capabilities") or {}
        if client is not None and isinstance(capabilities, dict) and "elicitation" in capabilities:
            server.ask = client.ask
        return {
            "protocolVersion": params.get("protocolVersion") or PROTOCOL,
            "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
            "serverInfo": {
                "name": "complydoc",
                "title": "complydoc",
                "version": __version__,
                "websiteUrl": "https://complydoc.io/",
                "icons": _icons(),
            },
            "instructions": server.instructions(),
        }
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": server.tools()}
    if method == "tools/call":
        arguments = params.get("arguments") or {}
        if not isinstance(arguments, dict):
            return _call_tool(server, "", {}, "The tool's arguments must be an object.")
        return _call_tool(server, str(params.get("name")), arguments)
    if method == "resources/list":
        cursor = params.get("cursor")
        if cursor is not None and not str(cursor).isdigit():
            raise _RequestError(-32602, f"Not a cursor this server gave: {cursor!r}")
        return server.resources(cursor)
    if method == "resources/templates/list":
        return {"resourceTemplates": []}
    if method == "resources/read":
        try:
            return server.read_resource(str(params.get("uri", "")))
        except (ToolError, FolderError) as error:
            raise _RequestError(-32002, str(error)) from error
    if method == "prompts/list":
        return {"prompts": PROMPTS}
    if method == "prompts/get":
        try:
            return get_prompt(str(params.get("name")), params.get("arguments") or {})
        except KeyError as error:
            raise _RequestError(-32602, f"No prompt called {error}") from error
        except ValueError as error:
            raise _RequestError(-32602, str(error)) from error
    raise _RequestError(-32601, "Method not found")


def _call_tool(
    server: Server, name: str, arguments: dict[str, Any], refused: str = ""
) -> dict[str, Any]:
    if refused:
        return {"content": [{"type": "text", "text": refused}], "isError": True}
    try:
        text = server.call(name, arguments)
        return {"content": [{"type": "text", "text": text}], "isError": False}
    except (ToolError, FolderError, RunError) as error:
        return {"content": [{"type": "text", "text": str(error)}], "isError": True}
    except Exception as error:  # A document that cannot be read is an answer, not a crash.
        print(f"complydoc mcp: {type(error).__name__}: {error}", file=sys.stderr)
        reason = f"complydoc could not read that document ({type(error).__name__})."
        return {"content": [{"type": "text", "text": reason}], "isError": True}


def serve(
    folders: Iterable[str | Path] | str | Path = (),
    stdin: IO[str] | None = None,
    stdout: IO[str] | None = None,
    *,
    store: Path | None = STORE,
    picker: Picker = pick_folder,
    file_picker: FilePicker = pick_files,
    inbox: Path | None = INBOX,
    clean_copies: Path = CLEAN_COPIES,
    fetch_name_model: bool = False,
    runs: Iterable[str | Path] = (),
    engine: str | None = None,
    config_dir: Path | None = None,
    reveals: Path | None = REVEAL_LOG,
) -> None:
    """Answer MCP requests on stdin until it closes. Logs go to stderr, never stdout.

    `folders` are the ones given at start; those chosen in a conversation are kept in
    `store` and added to them. `inbox`, a folder made at start, is always shared, so a file
    dropped in it opens without choosing anything; `None` leaves it out. Clean copies are
    written to `clean_copies`. With `fetch_name_model`, the model that finds names is
    downloaded once if it is missing, by a process of its own, before this one's network
    guard is armed. `runs` are folders of
    reports complydoc wrote; given them, the server offers an engineer's tools on them too.
    `engine` names the detection engine to read with (see `complydoc.mcp.engines`): the
    first installed when None, complydoc's own configuration with "none". `config_dir`,
    when given, is read instead of any engine's. Each request to see a masked value is
    recorded in `reveals`, without the value.
    """
    from complydoc.mcp.models import fetch_name_model as start_fetch

    source, out = stdin or sys.stdin, stdout or sys.stdout
    given = [folders] if isinstance(folders, (str, Path)) else list(folders)
    fetching = start_fetch() if fetch_name_model else None
    chosen = None if config_dir is not None else engines.find(engine)
    if chosen is not None:
        print(f"complydoc mcp: reading with {chosen.name}", file=sys.stderr)
    server = Server(
        Folders(given, store=store, inbox=inbox),
        picker=picker,
        file_picker=file_picker,
        clean_copies=clean_copies,
        fetching=fetching,
        runs=Runs([Path(r) for r in runs]) if runs else None,
        engine=chosen,
        config_dir=config_dir,
        reveals=reveals,
    )
    # The guard holds for the whole session, and lets go when the client hangs up.
    with offline.guarded(True):
        _loop(server, source, out)


def _reply(out: IO[str], message: dict[str, Any]) -> None:
    out.write(json.dumps(message, ensure_ascii=False) + "\n")
    out.flush()


class _Client:
    """The other end of stdio: lines read from it, and questions put to it mid-call.

    A question (elicitation) is a request from server to client, answered on the same
    stdin; anything else that arrives before the answer waits its turn.
    """

    def __init__(self, source: IO[str], out: IO[str]) -> None:
        self.source = source
        self.out = out
        self.waiting: deque[str] = deque()
        self.asked = 0

    def lines(self) -> Iterator[str]:
        while True:
            line = self.waiting.popleft() if self.waiting else self.source.readline()
            if not line:
                return
            yield line

    def ask(self, message: str, schema: dict[str, Any]) -> dict[str, Any] | None:
        self.asked += 1
        asked = f"complydoc-ask-{self.asked}"
        params = {"message": message, "requestedSchema": schema}
        _reply(
            self.out,
            {"jsonrpc": "2.0", "id": asked, "method": "elicitation/create", "params": params},
        )
        while line := self.source.readline():
            try:
                message_in = json.loads(line)
            except json.JSONDecodeError:
                message_in = None
            if (
                isinstance(message_in, dict)
                and message_in.get("id") == asked
                and "method" not in message_in
            ):
                result = message_in.get("result")
                return result if isinstance(result, dict) else None
            self.waiting.append(line)
        return None


def _loop(server: Server, source: IO[str], out: IO[str]) -> None:
    client = _Client(source, out)
    for line in client.lines():
        if not line.strip():
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            error = {"code": -32700, "message": "Parse error"}
            _reply(out, {"jsonrpc": "2.0", "id": None, "error": error})
            continue
        if not isinstance(request, dict):  # A batch, or a bare value: not a request.
            error = {"code": -32600, "message": "Invalid Request"}
            _reply(out, {"jsonrpc": "2.0", "id": None, "error": error})
            continue
        if "id" not in request or "method" not in request:
            # A notification, such as notifications/initialized, or a stray answer.
            continue
        try:
            result = _handle(server, request, client)
            _reply(out, {"jsonrpc": "2.0", "id": request["id"], "result": result})
        except _RequestError as invalid:
            error = {"code": invalid.code, "message": str(invalid)}
            _reply(out, {"jsonrpc": "2.0", "id": request["id"], "error": error})
        except Exception as crash:  # One bad request never ends the session.
            print(f"complydoc mcp: {type(crash).__name__}: {crash}", file=sys.stderr)
            error = {"code": -32603, "message": "Internal error"}
            _reply(out, {"jsonrpc": "2.0", "id": request["id"], "error": error})
