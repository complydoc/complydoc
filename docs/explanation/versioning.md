# Versions and deprecations

What a new version of complydoc may change, and how much notice you get before
something you rely on stops working.

complydoc is before 1.0. The rules below hold until then, and are the ones its
releases already follow.

## What a version number says

A version is `0.MINOR.PATCH`.

- A **patch** release (0.8.1 to 0.8.2) fixes and adds. Anything that worked on
  the release before still works, with the same command, the same code and the
  same configuration.
- A **minor** release (0.8.x to 0.9.0) is where a new way of using complydoc
  arrives, such as a command, and the only place a breaking change can happen.
  Its changelog entry says so under **Changed** or **Removed**, with what to do
  instead.

The report's `schema_version` is versioned on its own: it goes up whenever the
report JSON changes shape, in a patch or a minor release.

## What is covered

These are the parts a change to counts as breaking:

| Part | What is held steady |
| --- | --- |
| Command line | Commands, their options and arguments, and exit codes |
| Python API | The names `import complydoc as cd` exposes (`complydoc.__all__`), with their arguments and return types |
| Report JSON | Field names and meanings for a given `schema_version` |
| Configuration | Keys in `sensitive.yaml`, `hidden.yaml`, `readiness.yaml`, `pricing.yaml` and policy files |
| MCP server | Tool names and their arguments, and the `complydoc mcp` options |
| GitHub Action | Its inputs and outputs |

Not covered, and free to change in any release:

- **What is found.** Detectors improve in patch releases, so a document can
  have more or fewer findings, a different score or a different verdict after
  an upgrade. Pin the version, and keep a [baseline](../guides/baselines-and-tests.md),
  where a change in findings must be reviewed before it reaches CI.
- Modules and names that start with an underscore, and `complydoc.vendor`.
- The HTML report's and the viewer's layout and wording.
- Wording of messages, warnings and the text the MCP tools return to an
  assistant.
- Published accuracy numbers, which move with the benchmark.

## Reading older reports

`load_report`, and what is built on it, reads reports written by earlier
versions, back to `schema_version` 5. A report is never rewritten to read it.
A schema the installed version cannot read is refused with an error that names
it, rather than read wrongly.

## How something is retired

Nothing covered above is removed without notice:

1. It is marked deprecated in a release, named in that release's changelog under
   **Deprecated**, with its replacement. It keeps working, and says it is
   deprecated when used: a command or option on stderr, a Python name with a
   `DeprecationWarning`.
2. It is removed no sooner than **two minor releases** later, and never in a
   patch release. If deprecated in 0.9.0, it is still there in 0.10.x and can be
   removed in 0.11.0 at the earliest.

A renamed command keeps its old name, hidden, for the same period, as
`compare` did when it became `compare-readers`.

A security fix is the one exception: if keeping a behaviour would leave users
exposed, it can change in a patch release, and the changelog and the security
advisory say why. See the [security policy](https://github.com/complydoc/complydoc/blob/main/SECURITY.md).

## Which versions get fixes

Fixes, security ones included, go into the latest minor release only, as a new
patch release. To get a fix, upgrade within your minor version (0.8.1 to 0.8.2),
which by the rules above changes nothing you rely on.

## Upgrading safely

- Pin the exact version: the package (`complydoc==<version>`), the container tag
  (`ghcr.io/complydoc/complydoc:<version>`) and the GitHub Action
  (`complydoc/complydoc@v<version>`). Upgrade on purpose.
- Read the changelog entries between your version and the new one. Minor
  releases list every **Changed**, **Deprecated** and **Removed** item.
- Run your audit with `-W error::DeprecationWarning` (Python) or watch stderr
  (command line) to find what you still use that is on its way out.
