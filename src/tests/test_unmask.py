"""A model asks to see one masked value by its number, and only the person can allow it."""

from __future__ import annotations

import io
import json
import shutil
from pathlib import Path
from typing import Any

import pytest

import complydoc as cd
from complydoc.extraction.extract import Placed, mask_matches
from complydoc.mcp import serve
from complydoc.sensitive.base import SensitiveMatch
from complydoc.unmask import Stretch, moved

FIXTURES = Path(__file__).parent / "fixtures"
IBAN = "GB29 NWBK 6016 1331 9268 19"
CARD = "4111 1111 1111 1111"
TEXT = f"Pay the invoice to IBAN {IBAN} by Friday. Card on file: {CARD}."


@pytest.fixture
def gateway(tmp_path: Path) -> cd.Gateway:
    return cd.Gateway(engine="none", numbered=True, reveal_log=tmp_path / "reveals.jsonl")


def test_each_masked_value_carries_a_number(gateway):
    result = gateway.filter(TEXT)
    assert "[#1 IBAN " in result.text
    assert "[#2 Payment card number " in result.text
    assert IBAN not in result.text
    assert [(span.id, span.label) for span in result.spans] == [
        (1, "IBAN"),
        (2, "Payment card number"),
    ]
    assert "Pay the invoice to IBAN [#1 IBAN" in result.spans[0].context
    assert "6016" not in result.spans[0].context


def test_without_numbers_the_text_is_as_it_always_was(tmp_path):
    plain = cd.Gateway(engine="none", reveal_log=tmp_path / "log.jsonl").filter(TEXT)
    assert "[#" not in plain.text
    assert plain.spans == ()


def test_the_numbers_are_the_same_each_time_a_file_is_read(tmp_path):
    first = cd.Gateway(engine="none", numbered=True).read(FIXTURES / "invoice_de.pdf")
    again = cd.Gateway(engine="none", numbered=True).read(FIXTURES / "invoice_de.pdf")
    assert first.text == again.text
    assert [span.label for span in first.spans] == [span.label for span in again.spans]
    assert "[#2 IBAN " in first.text


def test_a_value_the_person_allows_is_given_and_logged_without_it(gateway):
    result = gateway.filter(TEXT)
    asked: list[cd.RevealRequest] = []

    def approve(request: cd.RevealRequest) -> bool:
        asked.append(request)
        return True

    assert gateway.reveal(result, 1, approve=approve, reason="to pay it") == IBAN
    assert asked[0].span.id == 1
    assert "Reason given: to pay it" in asked[0].question()
    assert "6016" not in asked[0].question()
    (entry,) = gateway.log.entries()
    assert entry["decision"] == "allowed"
    assert entry["reason"] == "to pay it"
    assert "6016" not in json.dumps(entry)


def test_a_value_the_person_declines_is_not_given(gateway):
    result = gateway.filter(TEXT)
    assert gateway.reveal(result, 1, approve=lambda request: False) is None
    assert [e["decision"] for e in gateway.log.entries()] == ["declined"]


def test_a_category_never_revealed_is_refused_without_asking(gateway):
    result = gateway.filter(TEXT)
    assert not result.spans[1].revealable

    def approve(request: cd.RevealRequest) -> bool:
        raise AssertionError("the person must not be asked")

    with pytest.raises(cd.UnmaskError, match="never revealed"):
        gateway.reveal(result, 2, approve=approve)
    assert [e["decision"] for e in gateway.log.entries()] == ["refused"]


def test_a_number_that_is_not_there_is_refused(gateway):
    result = gateway.filter(TEXT)
    with pytest.raises(cd.UnmaskError, match="from #1 to #2"):
        gateway.reveal(result, 9, approve=lambda request: True)


def test_a_result_from_another_gateway_cannot_be_revealed(gateway, tmp_path):
    other = cd.Gateway(engine="none", numbered=True, reveal_log=None).filter(TEXT)
    with pytest.raises(cd.UnmaskError, match="not made by this gateway"):
        gateway.reveal(other, 1, approve=lambda request: True)


def _match(category: str, column: int, length: int, evidence: str) -> SensitiveMatch:
    return SensitiveMatch(
        category=category,
        label=category,
        severity="high",
        page=1,
        line=1,
        column=column,
        length=length,
        masked="•" * length,
        evidence=evidence,  # type: ignore[arg-type]
    )


def test_overlapping_values_are_one_stretch_so_none_comes_out_with_another():
    # A model calls "Card 4111" an organisation over the card number's first digits.
    text = f"Card {CARD} paid."
    card = _match("card_number", 5, len(CARD), "confirmed")
    organisation = _match("organisation", 0, 9, "model")
    placed: list[Placed] = []
    mask_matches(text, [organisation, card], placed)
    (stretch,) = placed
    assert (stretch.start, stretch.end) == (0, 5 + len(CARD))
    assert [m.category for m in stretch.matches] == ["card_number", "organisation"]


def test_values_move_with_the_passages_taken_out_and_go_with_them():
    before = Stretch(1, 0, 4, "abcd", ("A",), ("a",))
    inside = Stretch(1, 12, 15, "xyz", ("B",), ("b",))
    after = Stretch(1, 30, 34, "wxyz", ("C",), ("c",))
    # Characters 10 to 20 were taken out and 5 put in their place.
    kept = moved([before, inside, after], [(10, 20, 5)])
    assert [(s.labels, s.start, s.end) for s in kept] == [(("A",), 0, 4), (("C",), 25, 29)]


# The MCP server.


def _session(docs: Path, tmp_path: Path, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = io.StringIO()
    serve(
        [docs],
        stdin=io.StringIO("".join(json.dumps(m) + "\n" for m in messages)),
        stdout=out,
        store=tmp_path / "store.json",
        picker=lambda prompt: None,
        clean_copies=tmp_path / "clean",
        reveals=tmp_path / "reveals.jsonl",
    )
    return [json.loads(line) for line in out.getvalue().splitlines()]


def _initialize(elicitation: bool) -> dict[str, Any]:
    capabilities = {"elicitation": {}} if elicitation else {}
    params = {"protocolVersion": "2025-06-18", "capabilities": capabilities}
    return {"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": params}


def _call(n: int, tool: str, **arguments: Any) -> dict[str, Any]:
    params = {"name": tool, "arguments": arguments}
    return {"jsonrpc": "2.0", "id": n, "method": "tools/call", "params": params}


def _said(reply: dict[str, Any]) -> str:
    return str(reply["result"]["content"][0]["text"])


@pytest.fixture
def docs(tmp_path: Path) -> Path:
    folder = tmp_path / "docs"
    folder.mkdir()
    shutil.copy(FIXTURES / "invoice_de.pdf", folder / "invoice_de.pdf")
    return folder


def _log(tmp_path: Path) -> list[dict[str, Any]]:
    path = tmp_path / "reveals.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()]


def test_an_opened_document_shows_the_numbers(docs, tmp_path):
    _, opened = _session(
        docs, tmp_path, [_initialize(False), _call(1, "open_document", path="invoice_de.pdf")]
    )
    assert "[#2 IBAN " in _said(opened)


def test_the_person_allows_one_value_in_the_clients_prompt(docs, tmp_path):
    answer = {"jsonrpc": "2.0", "id": "complydoc-ask-1", "result": {"action": "accept"}}
    replies = _session(
        docs,
        tmp_path,
        [
            _initialize(True),
            _call(1, "request_unmask", path="invoice_de.pdf", id=2, reason="to pay the invoice"),
            answer,
        ],
    )
    _, question, given = replies
    assert question["method"] == "elicitation/create"
    assert "see #2 (IBAN, page 1) in invoice_de.pdf?" in question["params"]["message"]
    assert "to pay the invoice" in question["params"]["message"]
    assert "The person allowed you to see #2 (IBAN)" in _said(given)
    assert not given["result"]["isError"]
    assert "•" not in _said(given).split(": ", 1)[1].splitlines()[0]
    assert [e["decision"] for e in _log(tmp_path)] == ["allowed"]


def test_a_request_that_arrives_while_the_person_is_asked_waits_its_turn(docs, tmp_path):
    answer = {"jsonrpc": "2.0", "id": "complydoc-ask-1", "result": {"action": "decline"}}
    replies = _session(
        docs,
        tmp_path,
        [
            _initialize(True),
            _call(1, "request_unmask", path="invoice_de.pdf", id=2, reason="to pay it"),
            {"jsonrpc": "2.0", "id": 2, "method": "ping"},
            answer,
        ],
    )
    _, question, declined, pong = replies
    assert question["method"] == "elicitation/create"
    assert declined["id"] == 1
    assert "declined" in _said(declined)
    assert pong == {"jsonrpc": "2.0", "id": 2, "result": {}}
    assert [e["decision"] for e in _log(tmp_path)] == ["declined"]


def test_a_client_that_cannot_ask_the_person_reveals_nothing(docs, tmp_path):
    _, refused = _session(
        docs,
        tmp_path,
        [_initialize(False), _call(1, "request_unmask", path="invoice_de.pdf", id=2, reason="x")],
    )
    assert refused["result"]["isError"]
    assert "cannot show complydoc's approval prompt" in _said(refused)
    assert [e["decision"] for e in _log(tmp_path)] == ["unavailable"]
