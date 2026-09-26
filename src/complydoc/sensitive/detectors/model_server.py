"""The name model, served by the process that runs the audit to its workers.

A token-classification model is large, and each worker that loads its own copy
pays for the load and the memory again. Worse, on a Mac the model runs on the
GPU through Metal, and a worker is forked from the pool's server process
without being started afresh: Metal cannot reach its shader compiler from such
a process, so the first page that needs a kernel not already compiled aborts
the worker (`MTLCompilerService ... No such process`) and the run falls back to
reading every document in one process.

So the audit's own process, which was started normally and can use the GPU,
holds the one copy of the model and answers the workers over a local socket.
Each request is a batch of text windows, and the model reads them as one batch.
Requests from several workers are answered one at a time: the model is not
thread-safe, and one GPU gains nothing from being asked twice at once.

The server starts before the model is loaded, and loads it on a thread of its
own while the workers read their first documents, which is most of the time a
model takes to load. A request that comes first waits for it.

The socket is a Unix socket (a named pipe on Windows), which the network guard
permits because it cannot leave the machine, and a connection must present the
run's random key.
"""

from __future__ import annotations

import os
import threading
from collections.abc import Callable, Sequence
from contextlib import suppress
from multiprocessing import AuthenticationError
from multiprocessing.connection import Client, Connection, Listener
from typing import Any

from complydoc.sensitive.registry import DetectorUnavailableError

__all__ = ["Entity", "ModelServer", "ServerAddress", "connect"]

Entity = tuple[str, int, int, float]
"""One entity in a window: its label, start, end and score."""

ServerAddress = tuple[Any, bytes]
"""Where a worker reaches the server, and the key it must present."""

Classify = Callable[[str, Sequence[str]], list[list[Entity]]]
"""Reads windows with the named model: one list of entities per window."""


class ModelServer:
    """Answers workers' requests with a model loaded in this process."""

    def __init__(self, classify: Classify, warm: Callable[[], object] | None = None) -> None:
        self._classify = classify
        self._key = os.urandom(32)
        self._listener = Listener(authkey=self._key)
        self._lock = threading.Lock()
        self._closed = False
        threading.Thread(target=self._accept, name="complydoc-models", daemon=True).start()
        if warm is not None:
            threading.Thread(target=self._warm, args=(warm,), daemon=True).start()

    def _warm(self, warm: Callable[[], object]) -> None:
        with self._lock, suppress(Exception):
            # A model that will not load says why when it is asked to read.
            warm()

    @property
    def address(self) -> ServerAddress:
        return self._listener.address, self._key

    def close(self) -> None:
        self._closed = True
        self._listener.close()

    def _accept(self) -> None:
        while not self._closed:
            try:
                connection = self._listener.accept()
            except (OSError, EOFError, AuthenticationError):
                # Closed, or a caller without the key: neither is for us to answer.
                if self._closed:
                    return
                continue
            threading.Thread(target=self._serve, args=(connection,), daemon=True).start()

    def _serve(self, connection: Connection) -> None:
        with connection:
            while True:
                try:
                    model_name, windows = connection.recv()
                except (EOFError, OSError):
                    return
                try:
                    with self._lock:
                        reply: tuple[str, Any] = ("ok", self._classify(model_name, windows))
                except DetectorUnavailableError as exc:
                    reply = ("unavailable", str(exc))
                except Exception as exc:
                    reply = ("error", f"{type(exc).__name__}: {exc}")
                try:
                    connection.send(reply)
                except (OSError, ValueError):
                    return


def connect(address: ServerAddress) -> Classify:
    """A function that asks the server, for a worker. Raises OSError if it cannot connect."""
    location, key = address
    connection = Client(location, authkey=key)
    lock = threading.Lock()

    def classify(model_name: str, windows: Sequence[str]) -> list[list[Entity]]:
        with lock:
            connection.send((model_name, list(windows)))
            status, value = connection.recv()
        if status == "unavailable":
            raise DetectorUnavailableError(value)
        if status != "ok":
            raise RuntimeError(f"the audit's model server could not read the text: {value}")
        return list(value)

    return classify
