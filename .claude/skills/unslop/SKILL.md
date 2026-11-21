---
name: unslop
description: Review a complydoc change for hurried or generated habits in code and copy before committing or opening a pull request. Use before every commit and PR, and when asked to clean up or "unslop" a change.
---

# Unslop

Read the change the way a careful maintainer would, then cut what does not earn its place.

## 1. Run the check

```bash
make unslop          # what this branch adds against origin/development, and its commits
uv run python src/scripts/unslop.py --staged   # only what is staged
```

Fix every finding, or add `unslop: ok` in a comment on the line when it is right as it is
(a `print` that is the command's output, an example in a docstring).

## 2. Read the diff yourself

The script only catches what a pattern can. Go through `git diff origin/development...` and ask:

**Code**
- Is every new function called from more than one place, or does it name something worth
  naming? Inline one-use wrappers.
- Does a helper already exist? Look in `src/complydoc/utils/` and the package before writing
  one. Do not add a third copy of the same five lines.
- Is every argument used? Every branch reachable? Remove what is not.
- Is a `try` there for a failure that can happen, and does it say why it is caught? No
  `except Exception: pass` without a reason.
- Do comments say why, not what? Delete comments that repeat the code.
- No speculative options, flags or abstractions for cases nobody asked for.
- Tests check behaviour on a real document or a fixture, not that a mock was called.

**Copy** (docs, site, CLI messages, docstrings, PR text)
- Plain and specific: what it does, with a number or an example where there is one.
- No sales words: seamless, robust, leverage, powerful, cutting-edge, effortless,
  empower, unlock, game-changing, best-in-class.
- No emoji, no "It's not X, it's Y", no rhetorical questions, no lists of three adjectives.
- Headings in sentence case. Match the voice of the page around it.

**Commits and pull requests**
- Authored as `Duarte Cardoso <126091251+duartecaldascardoso@users.noreply.github.com>`.
- No assistant attribution anywhere: no `Co-Authored-By: Claude`, no `Claude-Session:`,
  no "Generated with Claude Code". The script checks the commits on the branch.
- Branch named `<type>/<issue>-<slug>` from `development`, never `claude/...`.
- One issue per pull request; the PR template filled in, `make check` passing.

## 3. Keep it small

A cleanup changes no behaviour and keeps the tests as they are. If a change needs a test
edited to pass, it is not a cleanup: split it out and say so in the PR.
