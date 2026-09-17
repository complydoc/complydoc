"""How to install an optional part, worded for someone who installed the tool.

The hints used to say `uv sync --extra ocr`, which only works in a checkout of
this repository. Most people meet them after `uv tool install complydoc` or
`pip install complydoc`, where that command does nothing, so every hint names
both of those instead. Kept in one place so they cannot drift apart again.
"""

from __future__ import annotations

__all__ = ["extra_hint", "hf_model_hint", "spacy_model_hint"]

_TOOL_PYTHON = '"$(uv tool dir)/complydoc/bin/python"'
"""The interpreter of a `uv tool install`, which puts no `python` on PATH."""


def extra_hint(extra: str) -> str:
    """The commands that add one optional extra to an install."""
    return (
        f'add the "{extra}" extra to your install: '
        f'uv tool install --force "complydoc[{extra}]", or pip install "complydoc[{extra}]". '
        f"Keep any extras you already use in the brackets"
    )


def _spacy_wheel(model_name: str) -> str:
    """Where a spaCy model's wheel is published, for the spaCy that is installed.

    A model is built for one minor version of spaCy. Without spaCy installed
    there is nothing to match, and the version the shipped configuration was
    measured with is named.
    """
    version = "3.8.0"
    try:
        from spacy import about

        major, minor = about.__version__.split(".")[:2]
        version = f"{major}.{minor}.0"
    except (ImportError, ValueError):
        pass
    return (
        f"https://github.com/explosion/spacy-models/releases/download/"
        f"{model_name}-{version}/{model_name}-{version}-py3-none-any.whl"
    )


def spacy_model_hint(model_name: str) -> str:
    """How to install spaCy and one of its models, for pip and for a uv tool.

    `spacy download` shells out to pip, which a uv tool environment does not
    have, so the uv command installs the model's wheel alongside the tool.
    """
    return (
        f"names need the ner extra and the spaCy model {model_name!r}. "
        f'With pip: pip install "complydoc[ner]" && python -m spacy download {model_name}. '
        f'With uv: uv tool install --force "complydoc[ner]" --with {_spacy_wheel(model_name)}. '
        f"Keep any extras you already use in the brackets"
    )


def hf_model_hint(model_name: str) -> str:
    """How to fetch a Hugging Face model once, into the cache a scan reads from."""
    return (
        f"the model {model_name!r} is not on this machine. Fetch it once, while "
        f'online: {_TOOL_PYTHON} -c "from transformers import pipeline; '
        f"pipeline('token-classification', model='{model_name}')\" "
        f"(with pip, run the same with your own python)"
    )
