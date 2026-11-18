"""Fetching the name model for the MCP server, once, outside the network guard.

A scan never downloads anything: it runs inside the guard, and a model missing from disk
is reported as a category that could not be scanned. The edition of the extension that
masks names asks for the model once instead, when the server starts: it is fetched by a
process of its own, so the guard of this one never lets a connection through, and the
server answers from the first message while the download runs.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys

NAME_MODEL = "Babelscape/wikineural-multilingual-ner"
"""The model `config/sensitive.yaml` reads names with when it is installed."""

FILES = (
    "config.json",
    "model.safetensors",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.txt",
)
"""What reading names takes, about 700 MB: the weights and the tokenizer, nothing else."""

_FETCH = (
    "from huggingface_hub import snapshot_download\n"
    f"snapshot_download(repo_id={NAME_MODEL!r}, allow_patterns={list(FILES)!r})\n"
)


def can_read_names() -> bool:
    """Whether the libraries the name model needs are installed at all."""
    return all(importlib.util.find_spec(name) for name in ("transformers", "huggingface_hub"))


def name_model_on_disk() -> bool:
    if not can_read_names():
        return False
    from huggingface_hub import try_to_load_from_cache

    return all(isinstance(try_to_load_from_cache(NAME_MODEL, name), str) for name in FILES)


def fetch_name_model() -> subprocess.Popen[bytes] | None:
    """Start fetching the name model in a process of its own, or None when there is
    nothing to fetch: it is already on disk, or the libraries to read it are not installed."""
    if not can_read_names() or name_model_on_disk():
        return None
    # Its output goes nowhere near stdout, which carries the protocol.
    return subprocess.Popen(
        [sys.executable, "-c", _FETCH],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=sys.stderr,
    )
