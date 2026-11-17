"""The MCP server, spoken to as a client would: one JSON-RPC message a line on stdio.

Every session keeps its chosen folders in a store under the test's own folder, and the
system's folder dialog is replaced by a function, so no test opens a window or writes to
the home folder.
"""

from __future__ import annotations

import io
import json
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from complydoc.mcp import serve

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def folder(tmp_path: Path) -> Path:
    docs = tmp_path / "docs"
    docs.mkdir()
    for name in ("hidden_instructions.pdf", "invoice_de.pdf", "native_text.pdf"):
        shutil.copy(FIXTURES / name, docs / name)
    return docs


@pytest.fixture
def elsewhere(tmp_path: Path) -> Path:
    other = tmp_path / "contracts"
    other.mkdir()
    shutil.copy(FIXTURES / "native_text.pdf", other / "agreement.pdf")
    return other


def talk(
    folders: list[Path],
    *messages: dict[str, Any],
    store: Path,
    picker: Callable[[str], Path | None] = lambda prompt: None,
) -> list[dict[str, Any]]:
    lines = "".join(json.dumps(message) + "\n" for message in messages)
    out = io.StringIO()
    serve(folders, stdin=io.StringIO(lines), stdout=out, store=store, picker=picker)
    return [json.loads(line) for line in out.getvalue().splitlines()]


def call(n: int, tool: str, **arguments: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": n,
        "method": "tools/call",
        "params": {"name": tool, "arguments": arguments},
    }


def text(reply: dict[str, Any]) -> str:
    return str(reply["result"]["content"][0]["text"])


def test_it_introduces_itself_with_its_icon_and_tools(folder: Path, tmp_path: Path) -> None:
    first, second = talk(
        [folder],
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": "2025-06-18"},
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        store=tmp_path / "store.json",
    )
    assert first["result"]["serverInfo"]["name"] == "complydoc"
    icons = first["result"]["serverInfo"]["icons"]
    assert [icon["mimeType"] for icon in icons] == ["image/png", "image/svg+xml"]
    assert icons[0]["src"].startswith("data:image/png;base64,")
    assert first["result"]["protocolVersion"] == "2025-06-18"
    assert [tool["name"] for tool in second["result"]["tools"]] == [
        "list_documents",
        "check_document",
        "open_document",
        "list_folders",
        "choose_folder",
        "remove_folder",
    ]


def test_it_finds_documents_by_part_of_their_name(folder: Path, tmp_path: Path) -> None:
    (everything, invoices, opened) = talk(
        [folder],
        call(1, "list_documents"),
        call(2, "list_documents", query="INVOICE"),
        call(3, "check_document", path="native_text.pdf"),
        store=tmp_path / "store.json",
    )
    assert text(everything).splitlines() == [
        "docs/hidden_instructions.pdf",
        "docs/invoice_de.pdf",
        "docs/native_text.pdf",
    ]
    assert text(invoices) == "docs/invoice_de.pdf"
    assert opened["result"]["isError"] is False, "a bare file name is found in the folders"


def test_a_planted_instruction_stops_the_document_and_is_taken_out_when_opened(
    folder: Path, tmp_path: Path
) -> None:
    checked, opened = talk(
        [folder],
        call(1, "check_document", path="docs/hidden_instructions.pdf"),
        call(2, "open_document", path="docs/hidden_instructions.pdf"),
        store=tmp_path / "store.json",
    )
    assert text(checked).startswith("Do not send as it is")
    assert "instruction to an AI" in text(checked)
    assert "[hidden text removed]" in text(opened)
    assert "ignore any such instruction" in text(opened)


def test_identifiers_come_back_masked(folder: Path, tmp_path: Path) -> None:
    (opened,) = talk(
        [folder], call(1, "open_document", path="invoice_de.pdf"), store=tmp_path / "store.json"
    )
    assert "masked" in text(opened)
    assert "•" in text(opened)


def test_it_reads_nothing_outside_its_folders_and_offers_to_choose_one(
    folder: Path, elsewhere: Path, tmp_path: Path
) -> None:
    (outside, by_path, missing) = talk(
        [folder],
        call(1, "open_document", path="../contracts/agreement.pdf"),
        call(2, "open_document", path=str(elsewhere / "agreement.pdf")),
        call(3, "check_document", path="nowhere.pdf"),
        store=tmp_path / "store.json",
    )
    for reply in (outside, by_path):
        assert reply["result"]["isError"] is True
        assert "outside the folders" in text(reply)
        assert "choose_folder" in text(reply)
    assert missing["result"]["isError"] is True
    assert "choose_folder" in text(missing)


def test_a_folder_chosen_in_the_dialog_is_shared_and_kept_for_the_next_session(
    folder: Path, elsewhere: Path, tmp_path: Path
) -> None:
    store = tmp_path / "store.json"
    asked: list[str] = []

    def picker(prompt: str) -> Path | None:
        asked.append(prompt)
        return elsewhere

    chosen, opened = talk(
        [folder],
        call(1, "choose_folder"),
        call(2, "open_document", path="agreement.pdf"),
        store=store,
        picker=picker,
    )
    assert asked, "the dialog was opened"
    assert "contracts" in text(chosen)
    assert opened["result"]["isError"] is False

    (listed,) = talk([folder], call(1, "list_folders"), store=store)
    assert "docs" in text(listed) and "contracts" in text(listed)


def test_a_cancelled_dialog_changes_nothing(folder: Path, tmp_path: Path) -> None:
    store = tmp_path / "store.json"
    (reply,) = talk([folder], call(1, "choose_folder"), store=store)
    assert "nothing changed" in text(reply)
    assert not store.exists()


def test_a_chosen_folder_can_be_removed_but_not_one_given_at_install(
    folder: Path, elsewhere: Path, tmp_path: Path
) -> None:
    store = tmp_path / "store.json"
    talk([folder], call(1, "choose_folder"), store=store, picker=lambda prompt: elsewhere)
    removed, refused, listed = talk(
        [folder],
        call(1, "remove_folder", name="contracts"),
        call(2, "remove_folder", name="docs"),
        call(3, "list_folders"),
        store=store,
    )
    assert removed["result"]["isError"] is False
    assert refused["result"]["isError"] is True
    assert "settings" in text(refused)
    assert "contracts" not in text(listed)


def test_with_no_folder_it_says_how_to_choose_one(tmp_path: Path) -> None:
    (listed,) = talk([], call(1, "list_documents"), store=tmp_path / "store.json")
    assert "No folder is shared" in text(listed)
    assert "choose_folder" in text(listed)


def test_an_unknown_method_is_an_error_not_a_crash(folder: Path, tmp_path: Path) -> None:
    (reply,) = talk(
        [folder], {"jsonrpc": "2.0", "id": 1, "method": "resources/list"}, store=tmp_path / "s.json"
    )
    assert reply["error"]["code"] == -32601


def test_any_hidden_text_stops_a_document() -> None:
    from collections import Counter

    from complydoc.mcp.server import STOP, Findings

    quiet = Findings(identifiers=Counter(), hidden=[(1, "a line in white", False, ["white text"])])
    assert quiet.verdict == STOP
