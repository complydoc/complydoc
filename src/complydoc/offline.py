"""Process-wide network guard.

Document content must not leave the machine. The guard replaces the outbound
entry points of the standard library socket module with functions that raise,
so any network call, including one from a dependency, fails.

The guard is armed by the CLI before any document is opened, and
``src/tests/test_offline_guard.py`` asserts that a full audit completes with it in
place. Local ``AF_UNIX`` sockets are permitted because they cannot leave the
machine; every ``AF_INET``/``AF_INET6`` connection and every DNS lookup is
refused.

``arm`` changes the whole process and is used by the CLI. Library code uses
``guarded()``, which restores the socket module afterwards.
"""

from __future__ import annotations

import contextlib
import socket
from collections.abc import Iterator
from typing import Any, Final

__all__ = ["NetworkAccessError", "arm", "guard_status", "guarded", "is_armed", "permitted"]

_ORIGINAL_CONNECT: Final = socket.socket.connect
_ORIGINAL_CONNECT_EX: Final = socket.socket.connect_ex
_ORIGINAL_CREATE_CONNECTION: Final = socket.create_connection
_ORIGINAL_GETADDRINFO: Final = socket.getaddrinfo

_armed = False

_attempts: list[str] = []
"""Every refused connection, in order, for `guarded()` to hand back.

A loader that catches the refusal and carries on — falling back to a bundled
model, say — would otherwise leave no trace that it tried. That it tried is
the finding.
"""


def _refuse(description: str) -> NetworkAccessError:
    _attempts.append(description)
    return NetworkAccessError(f"{_MESSAGE} ({description})")


_MESSAGE = (
    "complydoc blocked an outbound network call. A dependency attempted a connection "
    "and the run was stopped."
)


class NetworkAccessError(RuntimeError):
    """Raised when any code attempts to open a network connection."""


def _is_local(family: int) -> bool:
    unix = getattr(socket, "AF_UNIX", None)
    return unix is not None and family == unix


def _blocked_connect(self: socket.socket, address: Any) -> None:
    if _is_local(self.family):
        _ORIGINAL_CONNECT(self, address)
        return
    raise _refuse(f"attempted connect to {address!r}")


def _blocked_connect_ex(self: socket.socket, address: Any) -> int:
    if _is_local(self.family):
        return int(_ORIGINAL_CONNECT_EX(self, address))
    raise _refuse(f"attempted connect_ex to {address!r}")


def _blocked_create_connection(address: Any, *args: Any, **kwargs: Any) -> socket.socket:
    raise _refuse(f"attempted create_connection to {address!r}")


def _blocked_getaddrinfo(host: Any, port: Any, *args: Any, **kwargs: Any) -> Any:
    raise _refuse(f"attempted DNS lookup of {host!r}")


def arm() -> None:
    """Install the guard. Idempotent."""
    global _armed
    if _armed:
        return
    # Replacing standard library entry points; mypy flags the signature mismatch.
    socket.socket.connect = _blocked_connect  # type: ignore[method-assign, assignment]
    socket.socket.connect_ex = _blocked_connect_ex  # type: ignore[method-assign, assignment]
    socket.create_connection = _blocked_create_connection
    socket.getaddrinfo = _blocked_getaddrinfo
    _armed = True


def disarm() -> None:
    """Restore the original socket entry points.

    Used by test teardown and by `guarded()` on its way out. Not something a
    document-reading path should ever call.
    """
    global _armed
    socket.socket.connect = _ORIGINAL_CONNECT  # type: ignore[method-assign]
    socket.socket.connect_ex = _ORIGINAL_CONNECT_EX  # type: ignore[method-assign]
    socket.create_connection = _ORIGINAL_CREATE_CONNECTION
    socket.getaddrinfo = _ORIGINAL_GETADDRINFO
    _armed = False


@contextlib.contextmanager
def guarded(active: bool = True) -> Iterator[list[str]]:
    """Arm the guard for this block, then leave the process as it was found.

    The library entry points run inside this, so a host application's own
    network calls keep working outside it.

    Restores on the way out whatever happens, and leaves the guard alone if the
    caller had already armed it.

    Yields a list that holds, once the block exits, every connection refused
    inside it. Blocks nest: an inner block collects only its own attempts.
    """
    seen: list[str] = []
    if not active:
        yield seen
        return

    start = len(_attempts)
    already_armed = _armed
    if not already_armed:
        arm()
    try:
        yield seen
    finally:
        # Filled on the way out, so a caller reading it after the block gets
        # every attempt made inside it, including by code that swallowed the
        # refusal and continued.
        seen.extend(_attempts[start:])
        if not already_armed:
            disarm()


_connections: list[str] = []
"""Every connection made inside `permitted()`, in order."""


def _recorded_connect(self: socket.socket, address: Any) -> None:
    if not _is_local(self.family):
        _connections.append(f"connect to {address!r}")
    _ORIGINAL_CONNECT(self, address)


def _recorded_connect_ex(self: socket.socket, address: Any) -> int:
    if not _is_local(self.family):
        _connections.append(f"connect_ex to {address!r}")
    return int(_ORIGINAL_CONNECT_EX(self, address))


def _recorded_getaddrinfo(host: Any, port: Any, *args: Any, **kwargs: Any) -> Any:
    _connections.append(f"DNS lookup of {host!r}")
    return _ORIGINAL_GETADDRINFO(host, port, *args, **kwargs)


@contextlib.contextmanager
def permitted() -> Iterator[list[str]]:
    """Let connections through for this block, and record each one.

    For code the caller has explicitly allowed to use the network, such as a
    loader that sends documents to a hosted parser. Works inside `guarded()`:
    the guard is lifted for the block and put back exactly as it was.

    `create_connection` is left as the standard library's, which resolves and
    connects through the recorded `getaddrinfo` and `connect`, so each step is
    recorded once.

    Yields a list that holds, once the block exits, every lookup and connection
    made inside it, without repeats.
    """
    global _armed
    saved = (
        socket.socket.connect,
        socket.socket.connect_ex,
        socket.create_connection,
        socket.getaddrinfo,
    )
    was_armed = _armed
    start = len(_connections)
    seen: list[str] = []

    socket.socket.connect = _recorded_connect  # type: ignore[method-assign, assignment]
    socket.socket.connect_ex = _recorded_connect_ex  # type: ignore[method-assign, assignment]
    socket.create_connection = _ORIGINAL_CREATE_CONNECTION
    socket.getaddrinfo = _recorded_getaddrinfo
    _armed = False
    try:
        yield seen
    finally:
        seen.extend(dict.fromkeys(_connections[start:]))
        (
            socket.socket.connect,  # type: ignore[method-assign]
            socket.socket.connect_ex,  # type: ignore[method-assign]
            socket.create_connection,
            socket.getaddrinfo,
        ) = saved
        _armed = was_armed


def is_armed() -> bool:
    return _armed


def guard_status() -> str:
    """The value recorded in every report's run metadata."""
    return "armed" if _armed else "not_armed"
