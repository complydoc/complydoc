"""The embedding model the demo pipeline calls.

With `OPENAI_API_KEY` set and `langchain-openai` installed, this is OpenAI's, and the
trace shows the real call, its host and its cost. Without them it is a local stand-in with
the same name and model, so the demo runs offline and free: it embeds with a deterministic
fake and looks up `localhost`, so the trace still has a connection to show.
"""

from __future__ import annotations

import os
import socket

try:
    if not os.environ.get("OPENAI_API_KEY"):
        raise ImportError("no key")
    from langchain_openai import OpenAIEmbeddings
except ImportError:
    from langchain_core.embeddings import DeterministicFakeEmbedding

    class OpenAIEmbeddings(DeterministicFakeEmbedding):  # type: ignore[no-redef]
        """A local stand-in, named as the trace would name OpenAI's."""

        model: str = "text-embedding-3-small"
        size: int = 1536

        def embed_documents(self, texts: list[str]) -> list[list[float]]:
            socket.getaddrinfo("localhost", 443)
            return super().embed_documents(texts)


__all__ = ["OpenAIEmbeddings"]
