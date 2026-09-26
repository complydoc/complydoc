"""The audit's name model, served to its workers over a local socket."""

from __future__ import annotations

from multiprocessing import AuthenticationError
from multiprocessing.connection import Client

import pytest

from complydoc.sensitive.detectors.model_server import ModelServer, connect
from complydoc.sensitive.registry import DetectorUnavailableError


def test_a_worker_gets_what_the_model_read():
    asked: list[tuple[str, list[str]]] = []

    def classify(model_name, windows):
        asked.append((model_name, list(windows)))
        return [[("PER", 0, len(w), 0.99)] for w in windows]

    server = ModelServer(classify)
    try:
        read = connect(server.address)
        assert read("model", ["Jane Doe", "Acme"]) == [[("PER", 0, 8, 0.99)], [("PER", 0, 4, 0.99)]]
        # Each worker has its own connection to the one model.
        assert connect(server.address)("model", ["Bo"]) == [[("PER", 0, 2, 0.99)]]
    finally:
        server.close()
    assert asked == [("model", ["Jane Doe", "Acme"]), ("model", ["Bo"])]


def test_a_model_that_is_missing_is_reported_as_it_would_be_in_the_worker():
    """So the category is listed as unscanned, with the same reason, not as a crash."""

    def classify(model_name, windows):
        raise DetectorUnavailableError("install the model")

    server = ModelServer(classify)
    try:
        with pytest.raises(DetectorUnavailableError, match="install the model"):
            connect(server.address)("model", ["text"])
    finally:
        server.close()


def test_any_other_failure_reaches_the_worker_as_an_error():
    def classify(model_name, windows):
        raise ValueError("bad input")

    server = ModelServer(classify)
    try:
        with pytest.raises(RuntimeError, match="ValueError: bad input"):
            connect(server.address)("model", ["text"])
    finally:
        server.close()


def test_a_caller_without_the_runs_key_is_refused_and_the_workers_still_served():
    server = ModelServer(lambda model_name, windows: [[] for _ in windows])
    try:
        location, _key = server.address
        with pytest.raises(AuthenticationError):
            Client(location, authkey=b"not the key")
        assert connect(server.address)("model", ["text"]) == [[]]
    finally:
        server.close()


def test_the_model_is_loaded_ahead_and_a_request_waits_for_it():
    order: list[str] = []

    def warm():
        order.append("loaded")

    def classify(model_name, windows):
        order.append("read")
        return [[] for _ in windows]

    server = ModelServer(classify, warm)
    try:
        connect(server.address)("model", ["text"])
    finally:
        server.close()
    assert order == ["loaded", "read"]
