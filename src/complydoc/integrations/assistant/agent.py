"""
Agent pipeline for identifying quick wins and analysis of the created report.

**This sends the report to a third party.** Everything else in complydoc runs
on the machine it was started on; this is the exception, the same shape as
`complydoc.integrations.typesafe` is for the hidden-instruction classifier.
`allow_network=True` has to be passed to `quick_wins_call` — it is not
defaulted anywhere — and the connections made are recorded for a caller to
read back with `connections_made()`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from complydoc.integrations.assistant.payload import report_payload
from complydoc.integrations.assistant.prompts import QUICK_WIN_ASSISTANT_PROMPT
from complydoc.integrations.assistant.schema import AssistantMessage

if TYPE_CHECKING:  # pragma: no cover - type-checking imports only
    from complydoc.report.models import AuditReport

__all__ = ["DEFAULT_MODEL", "connections_made", "quick_wins_call"]

DEFAULT_MODEL = "gpt-5.6-luna"

_connections: list[str] = []


def connections_made() -> list[str]:
    """Every connection `quick_wins_call` has made, in order, without repeats.

    What `offline.permitted()` recorded while the calls were made.
    """
    return list(_connections)


def quick_wins_call(
    report: AuditReport,
    *,
    allow_network: bool = False,
    model: str = DEFAULT_MODEL,
) -> AssistantMessage:
    """Model call to obtain a list of quick wins for the given report.

    `allow_network` has to be `True`. It is not a default anywhere: passing it
    is the caller saying they know the report leaves the machine. Raises
    `ImportError` if the `assistant` extra is not installed.
    """
    if not allow_network:
        raise ValueError(
            "quick_wins_call sends the report to a hosted chat model, which no "
            "other part of complydoc does without being asked. Pass "
            "allow_network=True to accept that."
        )

    from complydoc.utils.install import extra_hint

    try:
        from langchain.chat_models import init_chat_model
    except ImportError as exc:  # pragma: no cover - depends on the extra
        raise ImportError(
            f"the assistant needs the optional extra: {extra_hint('assistant')}"
        ) from exc

    from complydoc import offline

    chat_model = init_chat_model(model)
    structured_output_model = chat_model.with_structured_output(AssistantMessage)

    # The guard is armed for the whole of a scan. This is the one call the
    # caller allowed out, so it is let through here and recorded, rather than
    # the guard being lowered for the run.
    with offline.permitted() as seen:
        response: Any = structured_output_model.invoke(
            QUICK_WIN_ASSISTANT_PROMPT.format(audit_report=report_payload(report))
        )

    for connection in seen:
        if connection not in _connections:
            _connections.append(connection)

    if not isinstance(response, AssistantMessage):
        # Structured output is the model's to honour, and a model that answers
        # with something else is a failed call, not a crash in a report writer.
        raise ValueError(f"{model} did not answer in the shape the assistant asked for")
    return response
