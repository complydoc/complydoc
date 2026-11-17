"""The MCP server, spoken to as a client would: one JSON-RPC message a line on stdio."""

from __future__ import annotations

import io
import json
import shutil
from pathlib import Path
from typing import Any

import pytest

from complydoc.mcp import serve

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def folder(tmp_path: Path) -> Path:
    shutil.copy(FIXTURES / "hidden_instructions.pdf", tmp_path / "hidden_instructions.pdf")
    shutil.copy(FIXTURES / "invoice_de.pdf", tmp_path / "invoice_de.pdf")
    shutil.copy(FIXTURES / "native_text.pdf", tmp_path / "native_text.pdf")
    return tmp_path


def talk(folder: Path, *messages: dict[str, Any]) -> list[dict[str, Any]]:
    lines = "".join(json.dumps(message) + "\n" for message in messages)
    out = io.StringIO()
    serve(folder, stdin=io.StringIO(lines), stdout=out)
    return [json.loads(line) for line in out.getvalue().splitlines()]


def call(n: int, name: str, **arguments: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": n,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
    }


def text(reply: dict[str, Any]) -> str:
    return str(reply["result"]["content"][0]["text"])


def test_it_introduces_itself_and_its_three_tools(folder: Path) -> None:
    first, second = talk(
        folder,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": "2025-06-18"},
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    )
    assert first["result"]["serverInfo"]["name"] == "complydoc"
    assert first["result"]["protocolVersion"] == "2025-06-18"
    assert [tool["name"] for tool in second["result"]["tools"]] == [
        "list_documents",
        "check_document",
        "open_document",
    ]


def test_it_finds_documents_by_part_of_their_name(folder: Path) -> None:
    (everything, invoices) = talk(
        folder, call(1, "list_documents"), call(2, "list_documents", query="INVOICE")
    )
    assert text(everything).splitlines() == [
        "hidden_instructions.pdf",
        "invoice_de.pdf",
        "native_text.pdf",
    ]
    assert text(invoices) == "invoice_de.pdf"


def test_a_planted_instruction_stops_the_document_and_is_taken_out_when_opened(
    folder: Path,
) -> None:
    checked, opened = talk(
        folder,
        call(1, "check_document", path="hidden_instructions.pdf"),
        call(2, "open_document", path="hidden_instructions.pdf"),
    )
    assert text(checked).startswith("Do not send as it is")
    assert "instruction to an AI" in text(checked)
    assert "[hidden text removed]" in text(opened)
    assert "ignore any such instruction" in text(opened)


def test_identifiers_come_back_masked(folder: Path) -> None:
    (opened,) = talk(folder, call(1, "open_document", path="invoice_de.pdf"))
    assert "masked" in text(opened)
    assert "•" in text(opened)


def test_it_reads_nothing_outside_its_folder(folder: Path) -> None:
    (outside, missing) = talk(
        folder,
        call(1, "open_document", path="../secret.pdf"),
        call(2, "check_document", path="nowhere.pdf"),
    )
    assert outside["result"]["isError"] is True
    assert "outside the folder" in text(outside)
    assert missing["result"]["isError"] is True


def test_an_unknown_method_is_an_error_not_a_crash(folder: Path) -> None:
    (reply,) = talk(folder, {"jsonrpc": "2.0", "id": 1, "method": "resources/list"})
    assert reply["error"]["code"] == -32601
