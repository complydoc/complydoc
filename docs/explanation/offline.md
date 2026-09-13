# Offline by construction

complydoc never makes a network call. That is enforced, not promised.

`complydoc/offline.py` replaces the standard library's outbound entry points —
`socket.socket.connect`, `connect_ex`, `socket.create_connection` and
`socket.getaddrinfo` — with functions that raise. It is armed before any file is
opened, in the parent process and in every worker, because a guard that held
only in the parent would be no guard at all.

Local `AF_UNIX` sockets are allowed, because they cannot leave the machine.
Every `AF_INET`/`AF_INET6` connection and every DNS lookup is refused.

Every report records whether the guard was active, and the test suite runs a
full audit with it armed.

## Why a mechanism rather than a policy

The documents this is pointed at are the ones nobody is allowed to upload —
that is the entire reason the tool exists. A policy is something you have to
trust. A mechanism is something you can check, and something a transitive
dependency cannot quietly violate: a library that decides to phone home during a
run fails loudly rather than succeeding silently.

It also means there is no "send to an API for better results" option, not even
opt-in. An opt-in that exists is an opt-in somebody enables by accident.

## What that costs

Everything runs locally, so the model catalogue and prices are **vendored** —
data on disk, refreshed deliberately by a maintainer rather than fetched at
runtime. Prices carry their provenance: a handful verified against a provider's
own page, the rest marked as imported, and a report that prices against an
imported figure says so in its limitations.

OCR and name detection are local models too, which is why they are optional
extras: they are a large download, and a diagnostic run is still useful without
them. `complydoc doctor` says which are installed and what their absence costs.

## As a library

The command line arms the guard for the life of the process, which is right
when it owns the process. Called as a library it is armed for the audit and the
socket module is put back exactly as it was found — a library that permanently
broke its host's networking would be indefensible, whatever its reasons.

```python
import complydoc as cd

report = cd.security_audit("~/contracts")  # guarded
# your own HTTP calls still work here
```

Pass `offline_guard=False` only if you know your process needs the network while
the audit runs. The report records that you did.
