"""A second, independent read of a document's pages by a vision model the caller brings.

See `complydoc.verification.vision` for how a model is named and
`complydoc.verification.check` for what is compared.
"""

from complydoc.verification.check import reading_cost, render_page, verify_document
from complydoc.verification.vision import (
    VERIFY_SCOPES,
    VisionError,
    VisionModel,
    VisionPage,
    VisionReading,
    model_name,
    register_vision_model,
    registered_vision_model,
    resolve_vision,
)

__all__ = [
    "VERIFY_SCOPES",
    "VisionError",
    "VisionModel",
    "VisionPage",
    "VisionReading",
    "model_name",
    "reading_cost",
    "register_vision_model",
    "registered_vision_model",
    "render_page",
    "resolve_vision",
    "verify_document",
]
