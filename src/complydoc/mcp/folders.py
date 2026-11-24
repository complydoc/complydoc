"""The folders a person has let the assistant open documents from, and the picker that adds one.

Folders come from two places: the ones given when the server starts (the extension's
settings, or `--folder`), and the ones chosen from the conversation with `choose_folder`,
which are kept in `~/.complydoc/mcp-folders.json` for the next one. A folder is only ever
added through the operating system's own folder dialog, so the person clicks it: the model
can ask for the dialog, never choose what it lands on. The same holds for single files
(`choose_file`), which are shared for the session only, and the Inbox folder is always shared.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from collections.abc import Callable, Iterable
from pathlib import Path

STORE = Path.home() / ".complydoc" / "mcp-folders.json"
PICKER_TIMEOUT = 300
"""Seconds the folder dialog waits for the person before giving up."""

INBOX = Path.home() / "complydoc" / "Inbox"
"""A folder that is always shared: files dropped in it can be opened without choosing anything."""

Picker = Callable[[str], "Path | None"]
FilePicker = Callable[[str], "list[Path]"]


class FolderError(Exception):
    """Something about the folders the person can act on, said in plain words."""


class Folders:
    def __init__(
        self,
        given: Iterable[str | Path],
        store: Path | None = STORE,
        inbox: Path | None = None,
    ) -> None:
        self.store = store
        if inbox is not None:
            inbox.mkdir(parents=True, exist_ok=True)
            given = [inbox, *given]
        self.inbox = inbox.resolve() if inbox is not None else None
        self.given = _unique(_existing(given))
        self.files: list[Path] = []
        """Files chosen one by one in this session: never kept for the next one."""
        self.chosen = _unique(p for p in _existing(self._load()) if p not in self.given)

    @property
    def all(self) -> list[Path]:
        return [*self.given, *self.chosen]

    def labels(self) -> dict[str, Path]:
        """A short name for each folder, as the person would say it: its own name, or its
        parent's too where two folders share one."""
        names: dict[str, Path] = {}
        for folder in self.all:
            label = folder.name or str(folder)
            if label in names:
                label = f"{folder.parent.name}/{folder.name}"
            names[label] = folder
        return names

    def add(self, folder: Path) -> str:
        folder = folder.expanduser().resolve()
        if not folder.is_dir():
            raise FolderError(f"{folder} is not a folder.")
        if folder not in self.all:
            self.chosen.append(folder)
            self._save()
        return next(label for label, path in self.labels().items() if path == folder)

    def remove(self, name: str) -> Path:
        labels = self.labels()
        folder = labels.get(name) or next(
            (path for label, path in labels.items() if label.lower() == name.strip().lower()), None
        )
        if folder is None:
            raise FolderError(f"No folder called {name!r}. The folders are: {', '.join(labels)}.")
        if folder in self.given:
            raise FolderError(
                f"{name} was set when complydoc was installed; "
                "remove it in the extension's settings."
            )
        self.chosen.remove(folder)
        self._save()
        return folder

    def add_file(self, path: Path) -> Path:
        path = path.expanduser().resolve()
        if not path.is_file():
            raise FolderError(f"{path} is not a file.")
        if path not in self.files:
            self.files.append(path)
        return path

    def contains(self, path: Path) -> bool:
        if path in self.files:
            return True
        return any(path == folder or folder in path.parents for folder in self.all)

    def _load(self) -> list[str]:
        if self.store is None or not self.store.is_file():
            return []
        try:
            data = json.loads(self.store.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        return [str(item) for item in data.get("folders", []) if isinstance(item, str)]

    def _save(self) -> None:
        if self.store is None:
            return
        self.store.parent.mkdir(parents=True, exist_ok=True)
        data = {"folders": [str(folder) for folder in self.chosen]}
        self.store.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _existing(paths: Iterable[str | Path]) -> list[Path]:
    found = []
    for path in paths:
        folder = Path(path).expanduser()
        if folder.is_dir():
            found.append(folder.resolve())
    return found


def _unique(paths: Iterable[Path]) -> list[Path]:
    seen: list[Path] = []
    for path in paths:
        if path not in seen:
            seen.append(path)
    return seen


def pick_folder(prompt: str) -> Path | None:
    """Open the operating system's folder dialog. None when the person cancels it."""
    command = _picker_command(prompt)
    if command is None:
        raise FolderError(
            "complydoc could not open a folder dialog on this computer; add the folder in the "
            "extension's settings instead."
        )
    try:
        done = subprocess.run(
            command, capture_output=True, text=True, timeout=PICKER_TIMEOUT, check=False
        )
    except subprocess.TimeoutExpired:
        return None
    chosen = done.stdout.strip()
    return Path(chosen) if done.returncode == 0 and chosen else None


def _picker_command(prompt: str) -> list[str] | None:
    quoted = prompt.replace('"', "'")
    if sys.platform == "darwin":
        # `activate` brings the dialog in front of the assistant's window.
        return [
            "osascript",
            "-e",
            "activate",
            "-e",
            f'POSIX path of (choose folder with prompt "{quoted}")',
        ]
    if sys.platform == "win32":
        script = (
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog;"
            f"$d.Description = '{quoted.replace(chr(39), '')}';"
            "if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"
        )
        return ["powershell", "-NoProfile", "-STA", "-Command", script]
    if shutil.which("zenity"):
        return ["zenity", "--file-selection", "--directory", f"--title={quoted}"]
    if shutil.which("kdialog"):
        return ["kdialog", "--getexistingdirectory", str(Path.home()), "--title", quoted]
    return None


def pick_files(prompt: str) -> list[Path]:
    """Open the operating system's file dialog, for one file or several. Empty when the person
    cancels it."""
    command = _file_picker_command(prompt)
    if command is None:
        raise FolderError(
            "complydoc could not open a file dialog on this computer; drop the file in the "
            "Inbox folder or share its folder instead."
        )
    try:
        done = subprocess.run(
            command, capture_output=True, text=True, timeout=PICKER_TIMEOUT, check=False
        )
    except subprocess.TimeoutExpired:
        return []
    if done.returncode != 0:
        return []
    return [Path(line) for line in done.stdout.splitlines() if line.strip()]


def _file_picker_command(prompt: str) -> list[str] | None:
    quoted = prompt.replace('"', "'")
    if sys.platform == "darwin":
        return [
            "osascript",
            "-e",
            "activate",
            "-e",
            f'set picked to choose file with prompt "{quoted}" with multiple selections allowed',
            "-e",
            'set out to ""',
            "-e",
            "repeat with item_ in picked",
            "-e",
            "set out to out & POSIX path of item_ & linefeed",
            "-e",
            "end repeat",
            "-e",
            "out",
        ]
    if sys.platform == "win32":
        script = (
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$d = New-Object System.Windows.Forms.OpenFileDialog;"
            "$d.Multiselect = $true;"
            f"$d.Title = '{quoted.replace(chr(39), '')}';"
            "if ($d.ShowDialog() -eq 'OK') { $d.FileNames }"
        )
        return ["powershell", "-NoProfile", "-STA", "-Command", script]
    if shutil.which("zenity"):
        return ["zenity", "--file-selection", "--multiple", "--separator=\n", f"--title={quoted}"]
    if shutil.which("kdialog"):
        return [
            "kdialog",
            "--getopenfilename",
            str(Path.home()),
            "--multiple",
            "--separate-output",
            "--title",
            quoted,
        ]
    return None
