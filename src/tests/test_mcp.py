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
    clean_copies: Path | None = None,
) -> list[dict[str, Any]]:
    lines = "".join(json.dumps(message) + "\n" for message in messages)
    out = io.StringIO()
    serve(
        folders,
        stdin=io.StringIO(lines),
        stdout=out,
        store=store,
        picker=picker,
        clean_copies=clean_copies or store.parent / "clean copies",
    )
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
    assert first["result"]["capabilities"] == {"tools": {}, "resources": {}, "prompts": {}}
    assert [tool["name"] for tool in second["result"]["tools"]] == [
        "list_documents",
        "search_documents",
        "check_document",
        "check_folder",
        "open_document",
        "save_clean_copy",
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


def test_folders_of_code_are_left_out_of_the_listing(folder: Path, tmp_path: Path) -> None:
    (folder / "node_modules" / "pkg").mkdir(parents=True)
    shutil.copy(FIXTURES / "native_text.pdf", folder / "node_modules" / "pkg" / "readme.pdf")
    (listed,) = talk([folder], call(1, "list_documents"), store=tmp_path / "store.json")
    assert "node_modules" not in text(listed)


def test_with_no_folder_it_says_how_to_choose_one(tmp_path: Path) -> None:
    (listed,) = talk([], call(1, "list_documents"), store=tmp_path / "store.json")
    assert "No folder is shared" in text(listed)
    assert "choose_folder" in text(listed)


def test_an_unknown_method_is_an_error_not_a_crash(folder: Path, tmp_path: Path) -> None:
    (reply,) = talk(
        [folder],
        {"jsonrpc": "2.0", "id": 1, "method": "sampling/createMessage"},
        store=tmp_path / "s.json",
    )
    assert reply["error"]["code"] == -32601


def test_any_hidden_text_stops_a_document() -> None:
    from collections import Counter

    from complydoc.mcp.server import STOP, Findings

    quiet = Findings(identifiers=Counter(), hidden=[(1, "a line in white", False, ["white text"])])
    assert quiet.verdict == STOP


def request(n: int, method: str, **params: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": n, "method": method, "params": params}


def test_a_folder_is_checked_the_worst_first(folder: Path, tmp_path: Path) -> None:
    (checked,) = talk([folder], call(1, "check_folder"), store=tmp_path / "store.json")
    said = text(checked)
    assert said.startswith("Checked 3 documents")
    assert said.index("Do not send as it is") < said.index("docs/native_text.pdf")
    assert "docs/hidden_instructions.pdf" in said


def test_a_search_finds_the_page_and_never_a_masked_value(folder: Path, tmp_path: Path) -> None:
    found, nothing = talk(
        [folder],
        call(1, "search_documents", query="IBAN"),
        call(2, "search_documents", query="zebra crossing"),
        store=tmp_path / "store.json",
    )
    assert "docs/invoice_de.pdf, page" in text(found)
    assert "DE89" not in text(found), "identifiers stay masked in search results"
    assert "No document mentions" in text(nothing)


def test_a_clean_copy_is_saved_where_it_says(folder: Path, tmp_path: Path) -> None:
    out = tmp_path / "copies"
    (saved,) = talk(
        [folder],
        call(1, "save_clean_copy", path="hidden_instructions.pdf"),
        store=tmp_path / "store.json",
        clean_copies=out,
    )
    copy = out / "hidden_instructions (clean).txt"
    assert str(copy) in text(saved)
    assert "[hidden text removed]" in copy.read_text(encoding="utf-8")


def test_documents_are_resources_and_read_cleaned(folder: Path, tmp_path: Path) -> None:
    listed, read, wrong = talk(
        [folder],
        request(1, "resources/list"),
        request(2, "resources/read", uri="complydoc:///docs/hidden_instructions.pdf"),
        request(3, "resources/read", uri="file:///etc/passwd"),
        store=tmp_path / "store.json",
    )
    uris = [resource["uri"] for resource in listed["result"]["resources"]]
    assert "complydoc:///docs/invoice_de.pdf" in uris
    contents = read["result"]["contents"][0]
    assert contents["mimeType"] == "text/plain"
    assert "[hidden text removed]" in contents["text"]
    assert wrong["error"]["code"] == -32002


def test_prompts_are_offered_and_filled_in(folder: Path, tmp_path: Path) -> None:
    listed, filled, missing = talk(
        [folder],
        request(1, "prompts/list"),
        request(2, "prompts/get", name="check_before_sharing", arguments={"document": "acme"}),
        request(3, "prompts/get", name="compare_versions", arguments={"first": "v2"}),
        store=tmp_path / "store.json",
    )
    names = [prompt["name"] for prompt in listed["result"]["prompts"]]
    assert names == [
        "check_before_sharing",
        "summarise_safely",
        "check_a_folder",
        "compare_versions",
    ]
    message = filled["result"]["messages"][0]["content"]["text"]
    assert "acme" in message and "check_document" in message
    assert missing["error"]["code"] == -32602
