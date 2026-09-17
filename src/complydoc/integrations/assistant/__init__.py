"""Quick wins from a finished report, drafted by a hosted chat model.

    import complydoc as cd
    from complydoc.integrations.assistant import quick_wins_call

    report = cd.load_report("audit.json")
    message = quick_wins_call(report, allow_network=True)
    for win in message.quick_wins:
        print(win.quick_win, "-", win.justification)

Off unless the caller asks for it — the same shape as
`complydoc.integrations.typesafe`. `agent.py` makes the model call, `prompts.py`
holds what it is asked, and `schema.py` holds what it returns.

Unlike the Jev classifier, which only ever receives a passage already flagged
as worth asking about, the report is passed to the model whole: every masked
identifier, extracted passage and finding it holds. Treat the model named here
as a document processor in its own right, not a disambiguator of small spans.
"""

from __future__ import annotations

from complydoc.integrations.assistant.agent import (
    DEFAULT_MODEL,
    connections_made,
    quick_wins_call,
)
from complydoc.integrations.assistant.schema import AssistantMessage, QuickWin

__all__ = ["DEFAULT_MODEL", "AssistantMessage", "QuickWin", "connections_made", "quick_wins_call"]
