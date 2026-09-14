# Network isolation

complydoc makes no outbound network connections. This is enforced at runtime.

`complydoc/offline.py` replaces the standard library's outbound entry points —
`socket.socket.connect`, `connect_ex`, `socket.create_connection` and
`socket.getaddrinfo` — with functions that raise. It is armed before any file is
opened, in the parent process and in every worker, because a guard that held
only in the parent would be no guard at all.

Local `AF_UNIX` sockets are allowed, because they cannot leave the machine.
Every `AF_INET`/`AF_INET6` connection and every DNS lookup is refused.

Every report records whether the guard was active, and the test suite runs a
full audit with it armed.

## Rationale

The intended input is documents that cannot be uploaded to a third party.

A stated policy covers first-party code only. Replacing the socket entry points
also covers transitive dependencies: a library that opens a connection during a
run raises `NetworkAccessError`.

The one exception is `inspect_documents(..., allow_network=True)`, which lets the
loader call connect. The connections are recorded, the report states it, and
complydoc's own processing stays guarded.

## Consequences

The model catalogue and prices are **vendored**: data files updated with
`make prices` and read from disk at runtime. Each price carries its provenance: a
handful verified against a provider's own page, the rest marked imported, and a
report that prices against an imported figure says so.

OCR and name detection are local models, shipped as optional extras because of
their download size. `complydoc doctor` says what is installed.

## Library use

The command line arms the guard for the life of the process. The library entry
points arm it for the duration of the audit and restore the socket module
afterwards, including on exception, so unrelated network calls in the host
process are unaffected.

```python
import complydoc as cd

report = cd.security_audit("~/contracts")  # guarded
# your own HTTP calls still work here
```

Pass `offline_guard=False` only if you know your process needs the network while
the audit runs. The report records that you did.
