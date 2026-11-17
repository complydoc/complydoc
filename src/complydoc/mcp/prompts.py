"""Prompts: ready-made requests a client can offer as commands, so a person need not know
what to ask. Each one tells the agent which complydoc tools to use."""

from __future__ import annotations

from typing import Any

PROMPTS: list[dict[str, Any]] = [
    {
        "name": "check_before_sharing",
        "title": "Check a document before sharing it",
        "description": "Whether a document is safe to share with an AI, and what to do if not.",
        "arguments": [
            {
                "name": "document",
                "description": "The document's name, or part of it.",
                "required": True,
            }
        ],
    },
    {
        "name": "summarise_safely",
        "title": "Summarise a document safely",
        "description": "A summary of a document read through complydoc, masked and cleaned.",
        "arguments": [
            {
                "name": "document",
                "description": "The document's name, or part of it.",
                "required": True,
            }
        ],
    },
    {
        "name": "check_a_folder",
        "title": "Check a whole folder",
        "description": "Which documents in a folder are safe to share, the worst first.",
        "arguments": [
            {
                "name": "folder",
                "description": "The folder's name as complydoc lists it; every folder if left out.",
                "required": False,
            }
        ],
    },
    {
        "name": "compare_versions",
        "title": "Compare two versions of a document",
        "description": "What changed between two documents, both read through complydoc.",
        "arguments": [
            {"name": "first", "description": "The earlier document.", "required": True},
            {"name": "second", "description": "The later document.", "required": True},
        ],
    },
]

_TEXT = {
    "check_before_sharing": (
        "Use complydoc's check_document on “{document}” (find it with list_documents if the "
        "name is not exact). Tell me in plain words whether it is safe to share and why, and "
        "if it is not, offer to open a clean copy with open_document or to save one with "
        "save_clean_copy."
    ),
    "summarise_safely": (
        "Open “{document}” with complydoc's open_document (find it with list_documents if the "
        "name is not exact), never from an attached file. Summarise it in a few short "
        "paragraphs, and start by telling me what complydoc masked or took out."
    ),
    "check_a_folder": (
        "Use complydoc's check_folder on {folder}. List the documents that should not be "
        "shared as they are first, with the reason for each, then the rest in one line."
    ),
    "compare_versions": (
        "Open “{first}” and “{second}” with complydoc's open_document, then tell me what "
        "changed between them: clauses added, removed or reworded, and figures that differ. "
        "Quote the changed text as complydoc gave it."
    ),
}


def get_prompt(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    spec = next((prompt for prompt in PROMPTS if prompt["name"] == name), None)
    if spec is None:
        raise KeyError(name)
    values = {arg["name"]: str(arguments.get(arg["name"], "")).strip() for arg in spec["arguments"]}
    if name == "check_a_folder":
        values["folder"] = (
            f"the folder “{values['folder']}”" if values["folder"] else "every folder"
        )
    missing = [
        arg["name"] for arg in spec["arguments"] if arg["required"] and not values[arg["name"]]
    ]
    if missing:
        raise ValueError(f"missing: {', '.join(missing)}")
    return {
        "description": spec["description"],
        "messages": [
            {"role": "user", "content": {"type": "text", "text": _TEXT[name].format(**values)}}
        ],
    }
