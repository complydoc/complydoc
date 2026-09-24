"""A vision model as a reader of pages, brought by the caller.

complydoc runs no model and holds no key. A caller who wants pages read by a
vision model writes the call, with their own client and their own key, and
names it:

    # mymodels.py
    import base64
    import anthropic
    import complydoc as cd

    def claude():
        client = anthropic.Anthropic()

        def read(page: cd.VisionPage) -> cd.VisionReading:
            response = client.messages.create(
                model="claude-opus-5",
                max_tokens=4096,
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": page.media_type,
                        "data": base64.b64encode(page.image).decode(),
                    }},
                    {"type": "text", "text": "Transcribe every word on this page."},
                ]}],
            )
            return cd.VisionReading(
                text=response.content[0].text,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

        read.model = "claude-opus-5"
        return read

    complydoc audit contract.pdf --verify vision:mymodels:claude

`vision:module:function` has the same shape as `--classifier module:function`:
the function is imported and called with no arguments, and what it returns is
the model. It is called once per page with a `VisionPage` and returns a
`VisionReading`, or just the text.

A `model` attribute on it names the model, which is what the reading is
called in the report (`vision:claude-opus-5`) and what it is priced as. The
provider's token counts, where the response carries them, make the cost
`actual`; without them it is estimated from the page's size.

There is no bare `--verify vision`. complydoc does not run vision inference
itself, so there is nothing it could name on the caller's behalf.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

__all__ = [
    "VERIFY_SCOPES",
    "VisionError",
    "VisionModel",
    "VisionPage",
    "VisionReading",
    "model_name",
    "register_vision_model",
    "registered_vision_model",
    "resolve_vision",
]

VERIFY_SCOPES = ("flagged", "all")
"""`flagged` reads again only the pages routing sent to vision, the pages with no
usable reading, and the pages two readers disagreed about. `all` reads every page."""


@dataclass(frozen=True, slots=True)
class VisionPage:
    """One page, rendered, as the model is given it."""

    document: str
    """The file's name, for a model that logs what it was sent."""
    number: int
    """1-indexed."""
    image: bytes
    """The page as an image, encoded as `media_type`."""
    width_px: int
    height_px: int
    media_type: str = "image/png"


@dataclass(frozen=True, slots=True)
class VisionReading:
    """What a vision model read off one page."""

    text: str
    input_tokens: int | None = None
    """The provider's own count, from the response. Makes the cost `actual`."""
    output_tokens: int | None = None
    usd: float | None = None
    """What the call cost, where the caller already knows. Taken as given."""
    model: str | None = None
    """The model that answered, where it differs from the one the reader named."""


@runtime_checkable
class VisionModel(Protocol):
    """Anything called with a page that returns what it read."""

    def __call__(self, page: VisionPage) -> VisionReading | str: ...


class VisionError(ValueError):
    """A `--verify` value that could not be turned into a vision model."""


_model: VisionModel | None = None


def register_vision_model(model: VisionModel | None) -> None:
    """Read pages with `model` in this process. None removes it.

    A model is a function in one process. A worker process resolves its own
    from the spec it was handed, which is why the command line takes a name.
    """
    global _model
    _model = model


def registered_vision_model() -> VisionModel | None:
    return _model


def model_name(model: object) -> str:
    """What a model's readings are called, without the `vision:` prefix."""
    for attribute in ("model", "name"):
        value = getattr(model, attribute, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return getattr(model, "__name__", None) or type(model).__name__


def resolve_vision(spec: str) -> VisionModel:
    """Build the vision model `spec` names: `vision:module:function`.

    The function is imported and called with no arguments; what it returns is
    the model. Its key, its client and wherever it sends the page are the
    caller's, and complydoc sees none of them.
    """
    name = spec.strip()
    kind, _, rest = name.partition(":")
    if kind.lower() != "vision" or not rest:
        raise VisionError(
            f"unknown verifier {name!r}: use 'vision:module:function', naming code of "
            f"your own that sends a page to a vision model"
        )
    if ":" not in rest:
        raise VisionError(
            f"{name!r} names no function: use 'vision:module:function'. complydoc runs "
            f"no vision model of its own, so there is none to pick by name"
        )

    module_name, _, attribute = rest.partition(":")
    try:
        from importlib import import_module

        module = import_module(module_name)
    except ImportError as exc:
        raise VisionError(f"cannot import {module_name!r}: {exc}") from exc

    factory = getattr(module, attribute, None)
    if factory is None:
        raise VisionError(f"{module_name!r} has no {attribute!r}")
    if not callable(factory):
        raise VisionError(f"{rest} is not callable")

    built: object = factory()
    if not callable(built):
        raise VisionError(f"{rest}() returned {type(built).__name__}, not a callable")
    return built
