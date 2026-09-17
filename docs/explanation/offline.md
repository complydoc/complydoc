# Network isolation

complydoc makes no outbound network connections of its own. This is enforced at
runtime. Two things a caller can switch on send data out, and both are named
below and recorded in the report.

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

There are two exceptions, and neither happens unless a caller asks for it.

`inspect_documents(..., allow_network=True)` lets the loader being inspected
call connect. The connections are recorded, the report states it, and
complydoc's own processing stays guarded.

A registered instruction classifier can be backed by a hosted service, which
`complydoc.integrations.typesafe.jev_classifier` is. **That sends the text of
the passages it judges to a third party**, so the premise at the top of this
page does not hold for a run using one. Building it requires `allow_network=True`
— there is no default that turns it on — each call is let through the guard one
at a time rather than the guard being lowered for the run, and the hosts are
recorded. A report that sent text somewhere names the hosts in
`run.content_sent_to`, states it as an important limitation, and the CLI says so
above the summary. A run without such a classifier registered reports nothing
there, because nothing left.

`--classifier` hands the name to every worker process, which resolves its own,
so a parallel run judges every document and a hosted classifier opens a
connection from each worker rather than only from this one. A classifier
registered in Python cannot cross a process boundary, and
`run.classifier_missed_workers` counts the documents it therefore never saw.

`run.classifier_calls` and `run.classifier_failures` record what was asked and
what could not be answered. A call that fails is no score and so no finding, so
without the second number a run that reached nothing looked like a run that
found nothing.

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
