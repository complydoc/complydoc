"""The MCP server's tools for engineers: recorded runs read from `.complydoc`."""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("langchain_text_splitters")

from langchain_core.document_loaders import BaseLoader
from langchain_core.documents import Document
from langchain_text_splitters import CharacterTextSplitter, RecursiveCharacterTextSplitter

import complydoc as cd
from complydoc.mcp import serve

IBAN = "GB29 NWBK 6016 1331 9268 19"


class _Loader(BaseLoader):
    def __init__(self, path: str) -> None:
        self.file_path = path

    def lazy_load(self):  # type: ignore[no-untyped-def]
        yield Document(
            page_content=f"Payments go to account {IBAN} every month. " * 5,
            metadata={"source": self.file_path, "page": 0},
        )


@pytest.fixture
def runs(tmp_path: Path) -> Path:
    """Two runs of one pipeline, the second with a step the first did not have."""
    out = tmp_path / ".complydoc"
    with cd.observe("contracts-ingest", out=out):
        RecursiveCharacterTextSplitter(chunk_size=80, chunk_overlap=0).split_documents(
            _Loader(str(tmp_path / "msa.pdf")).load()
        )
    with cd.observe("contracts-ingest", out=out):
        documents = _Loader(str(tmp_path / "msa.pdf")).load()
        documents = CharacterTextSplitter(chunk_size=200, chunk_overlap=0).split_documents(
            documents
        )
        RecursiveCharacterTextSplitter(chunk_size=80, chunk_overlap=0).split_documents(documents)
    return out


def talk(*messages: dict[str, Any], runs: list[Path], store: Path) -> list[dict[str, Any]]:
    lines = "".join(json.dumps(message) + "\n" for message in messages)
    out = io.StringIO()
    serve([], stdin=io.StringIO(lines), stdout=out, store=store, runs=runs)
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


def test_the_engineer_tools_are_offered_only_with_runs(runs: Path, tmp_path: Path) -> None:
    listing = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    (without,) = talk(listing, runs=[], store=tmp_path / "s.json")
    (with_runs,) = talk(listing, runs=[runs], store=tmp_path / "s.json")
    names = {tool["name"] for tool in with_runs["result"]["tools"]}
    assert {"list_runs", "show_run", "compare_runs", "find_value"} <= names
    assert (
        not names
        - {t["name"] for t in without["result"]["tools"]}
        - {
            "list_runs",
            "show_run",
            "compare_runs",
            "find_value",
        }
    )
    assert "list_runs" not in {tool["name"] for tool in without["result"]["tools"]}


def test_runs_are_listed_newest_first_with_their_pipeline(runs: Path, tmp_path: Path) -> None:
    (reply,) = talk(call(1, "list_runs"), runs=[runs], store=tmp_path / "s.json")
    listed = [line for line in text(reply).splitlines() if line.startswith("- ")]
    assert len(listed) == 2
    assert all("pipeline 'contracts-ingest'" in line for line in listed)


def test_a_pipeline_run_shows_each_step_its_time_and_what_it_passed_on(
    runs: Path, tmp_path: Path
) -> None:
    (reply,) = talk(
        call(1, "show_run", run="contracts-ingest"), runs=[runs], store=tmp_path / "s.json"
    )
    shown = text(reply)
    assert "1. _Loader (load)" in shown
    assert "CharacterTextSplitter (split)" in shown  # the newest run
    assert "passed on IBAN" in shown
    assert "Slowest:" in shown
    assert "Nothing was sent outside this machine." in shown
    assert IBAN not in shown


def test_a_run_is_compared_with_the_one_before(runs: Path, tmp_path: Path) -> None:
    (reply,) = talk(
        call(1, "compare_runs", run="contracts-ingest"), runs=[runs], store=tmp_path / "s.json"
    )
    compared = text(reply)
    assert "- CharacterTextSplitter:" in compared and "new in this run" in compared
    assert "- _Loader:" in compared and "was" in compared


def test_a_value_is_followed_without_being_shown(runs: Path, tmp_path: Path) -> None:
    (reply,) = talk(call(1, "find_value", value=IBAN), runs=[runs], store=tmp_path / "s.json")
    found = text(reply)
    assert reply["result"]["isError"] is False
    assert "IBAN" in found and "in 2 of 2 reports" in found
    assert "still held it" in found
    assert IBAN not in found


def test_a_run_that_is_not_there_is_an_answer_not_a_crash(runs: Path, tmp_path: Path) -> None:
    (missing, earlier) = talk(
        call(1, "show_run", run="nightly-import"),
        call(2, "compare_runs", run="contracts-ingest", against="nightly-import"),
        runs=[runs],
        store=tmp_path / "s.json",
    )
    assert missing["result"]["isError"] is True
    assert "No run called 'nightly-import'" in text(missing)
    assert earlier["result"]["isError"] is True


def test_an_empty_folder_says_how_runs_are_made(tmp_path: Path) -> None:
    empty = tmp_path / ".complydoc"
    empty.mkdir()
    (reply,) = talk(call(1, "list_runs"), runs=[empty], store=tmp_path / "s.json")
    assert "cd.observe" in text(reply)
