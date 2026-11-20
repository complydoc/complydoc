# Security policy

complydoc reads documents that hold personal data, and decides what of them reaches a
model. A flaw in it can let that data through, so we treat security reports first.

## Supported versions

Until 1.0, fixes go into the latest minor release only. Upgrade to it to get a fix.

| Version | Fixes |
| --- | --- |
| 0.8.x | Yes |
| < 0.8 | No |

## Reporting a vulnerability

Please do not open a public issue, discussion or pull request for a vulnerability.

Report it privately on GitHub, under
[Security → Report a vulnerability](https://github.com/complydoc/complydoc/security/advisories/new).
If you cannot use GitHub, write to hi@complydoc.io with "security" in the subject.

Tell us the version, how you installed it (PyPI, container image, Claude Desktop
extension, plugin), and the smallest document or steps that show the problem. A document
that holds real personal data should not be sent: make one up that shows the same thing.

What happens next:

- We confirm we have your report within 3 working days.
- We tell you whether we treat it as a vulnerability, and how severe, within 10 working
  days.
- We aim to release a fix for a critical or high severity issue within 30 days, and
  agree the date it becomes public with you. A fix is announced in the changelog and in a
  GitHub security advisory, with a CVE where one applies.
- We credit you in the advisory, unless you ask us not to.

## What counts

A vulnerability is something that breaks a promise complydoc makes about your data or
your machine, for example:

- a document that makes complydoc run code, or read or write files outside the folders it
  was given;
- the MCP server opening a document outside the folders the user allowed, or handing the
  assistant a value it reported as masked;
- a raw value written into a report, where only its fingerprint should be;
- complydoc making a network connection while the offline guard is on;
- the viewer serving anything outside its reports folder, or answering a host it was not
  told to.

A detector that misses a value, or flags one it should not, is an accuracy bug, not a
vulnerability: open an [issue](https://github.com/complydoc/complydoc/issues) for it.
The same goes for a hidden instruction that is not caught, unless it gets past a check
that reported the document as clean on purpose. If you are not sure, report it privately.

Loaders and models from other projects that complydoc calls are reported to those
projects.

## Verifying a release

Every release ships a CycloneDX bill of materials (`complydoc-sbom.json`), a
`SHA256SUMS` file and signed build provenance for each file, so you can check that what
you install was built from this repository by its release workflow. From 0.8.3 the
Claude Desktop extension (`complydoc.mcpb`) carries it too:

```bash
gh attestation verify complydoc-0.8.2-py3-none-any.whl --repo complydoc/complydoc
gh attestation verify complydoc.mcpb --repo complydoc/complydoc         # from 0.8.3
gh attestation verify oci://ghcr.io/complydoc/complydoc:0.8.2 --repo complydoc/complydoc
```

From 0.8.3 the container images are also signed with Sigstore, with no stored key. To check a
signature with cosign:

```bash
cosign verify ghcr.io/complydoc/complydoc:0.8.2 \
  --certificate-identity-regexp '^https://github.com/complydoc/complydoc/\.github/workflows/publish\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Packages on PyPI are uploaded by the release workflow through trusted publishing, so no
upload token exists to be stolen.
