"""The tools complydoc offers an agent, described for the agent that chooses between them."""

from __future__ import annotations

from typing import Any

_PATH = {"path": {"type": "string", "description": "As list_documents gives it, or its name."}}
_FOLDER = {
    "folder": {
        "type": "string",
        "description": "A folder's name as list_folders gives it; every shared folder if left out.",
    }
}


def _tool(
    name: str, description: str, properties: dict[str, Any], required: list[str]
) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return {"name": name, "description": description, "inputSchema": schema}


TOOLS: list[dict[str, Any]] = [
    _tool(
        "list_documents",
        "List the documents in the folders the person shared, optionally only those whose name "
        "contains a word. Use it to find the file a person means before opening it.",
        {
            "query": {"type": "string", "description": "Part of the file name, any case."},
            "page": {
                "type": "integer",
                "minimum": 1,
                "description": "1 for the first 50 documents, 2 for the next, and so on.",
            },
        },
        [],
    ),
    _tool(
        "search_documents",
        "Find which documents say something, and where: words searched in the shared documents' "
        "text, already masked and cleaned, with the page and a short passage for each match.",
        {"query": {"type": "string", "description": "Words to look for, any case."}, **_FOLDER},
        ["query"],
    ),
    _tool(
        "check_document",
        "Say whether a document is safe to share with an AI assistant: the personal and "
        "financial details in it, and any text hidden from a reader or written as instructions "
        "to a model. Nothing of the document's content is returned.",
        _PATH,
        ["path"],
    ),
    _tool(
        "check_folder",
        "Say which documents in a folder are safe to share, the ones that are not first, each "
        "with what it holds. Use it before a folder is shared or uploaded anywhere.",
        _FOLDER,
        [],
    ),
    _tool(
        "open_document",
        "Read a document for the conversation. Always use this instead of asking for the file: "
        "personal and financial details come back masked and hidden passages are taken out, and "
        "a short note says what was removed. Tell the person what the note says.",
        _PATH,
        ["path"],
    ),
    _tool(
        "request_unmask",
        "Ask the person to see one masked value, by the number it carries in the text, such as "
        "12 for [#12 IBAN ••••4521]. Use it only when the task cannot be done without the value, "
        "and say why. The person sees the sentence around it and your reason, and allows or "
        "declines in their app; only that one value is given. Never ask for many at once.",
        {
            **_PATH,
            "id": {"type": "integer", "minimum": 1, "description": "The number after #."},
            "reason": {
                "type": "string",
                "description": "Why the task needs this value, in one sentence for the person.",
            },
        },
        ["path", "id", "reason"],
    ),
    _tool(
        "save_clean_copy",
        "Save a clean copy of a document as a text file, with personal and financial details "
        "masked and hidden passages taken out, for the person to send to someone or upload "
        "elsewhere. Say where it was saved.",
        _PATH,
        ["path"],
    ),
    _tool(
        "list_folders",
        "Say which folders the person has let complydoc open documents from.",
        {},
        [],
    ),
    _tool(
        "choose_folder",
        "Open the computer's folder dialog so the person can pick a folder to share. Use it when "
        "they ask to use a folder, or when a document they want is not in a shared folder and they "
        "agree to choose where it is. The person picks; you cannot.",
        {},
        [],
    ),
    _tool(
        "remove_folder",
        "Stop sharing a folder chosen earlier, by the name list_folders gives it.",
        {"name": {"type": "string", "description": "As list_folders gives it."}},
        ["name"],
    ),
]

_RUN = {
    "run": {
        "type": "string",
        "description": "A run's name as list_runs gives it, or part of it; the newest if left out.",
    }
}

RUN_TOOLS: list[dict[str, Any]] = [
    _tool(
        "list_runs",
        "List the runs complydoc recorded, newest first: pipelines observed with cd.observe, "
        "loader comparisons and audits, with when they ran, how long they took and the commit.",
        {"query": {"type": "string", "description": "Part of a run's name, any case."}},
        [],
    ),
    _tool(
        "show_run",
        "Show one run: for a pipeline, the time of each step, what it passed on and where it "
        "sent anything; for a loader comparison, each loader's time, pages, characters and facts "
        "kept; for evals, which facts each reader kept. Values in it are already masked.",
        _RUN,
        [],
    ),
    _tool(
        "compare_runs",
        "Compare a pipeline run's step times with an earlier run of the same pipeline, the one "
        "before it unless `against` names another: what got slower, faster, new or gone.",
        {
            **_RUN,
            "against": {
                "type": "string",
                "description": "The run to compare with, if not the one before.",
            },
        },
        [],
    ),
    _tool(
        "find_value",
        "Find where a value, such as an IBAN or an email address, went across the recorded runs: "
        "the documents it was read from, the pipeline steps that still held it and the hosts it "
        "was sent to. The answer shows it masked.",
        {"value": {"type": "string", "description": "The value as it is written."}},
        ["value"],
    ),
]
"""The tools for engineers, offered when the server is given folders of runs."""


# What each tool does to the person's machine, for clients that ask before a tool changes
# something and for directories that review a server. Nothing reaches the network.
_HINTS: dict[str, tuple[str, bool, bool]] = {
    # name: (title, read only, destructive)
    "list_documents": ("List shared documents", True, False),
    "search_documents": ("Search shared documents", True, False),
    "check_document": ("Check a document before sharing it", True, False),
    "check_folder": ("Check a whole folder", True, False),
    "open_document": ("Open a document, cleaned", True, False),
    "request_unmask": ("Ask to see one masked value", True, False),
    "save_clean_copy": ("Save a clean copy", False, False),
    "list_folders": ("List shared folders", True, False),
    "choose_folder": ("Choose a folder to share", False, False),
    "remove_folder": ("Stop sharing a folder", False, True),
    "list_runs": ("List recorded runs", True, False),
    "show_run": ("Show a run", True, False),
    "compare_runs": ("Compare two runs", True, False),
    "find_value": ("Find where a value went", True, False),
}

for _entry in [*TOOLS, *RUN_TOOLS]:
    _title, _read_only, _destructive = _HINTS[_entry["name"]]
    _entry["title"] = _title
    _entry["annotations"] = {
        "title": _title,
        "readOnlyHint": _read_only,
        "destructiveHint": _destructive,
        "idempotentHint": _read_only or _entry["name"] == "remove_folder",
        "openWorldHint": False,
    }
