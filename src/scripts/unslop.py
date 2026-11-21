"""Flag the habits of hurried or generated changes in what a branch adds.

Reads the lines a branch adds against `development` (or the staged lines, with
`--staged`) and the commits it carries, and prints each line that looks like:

- assistant attribution: a `Co-Authored-By: Claude` or `Claude-Session:` trailer,
  "Generated with Claude Code", or a commit authored as `noreply@anthropic.com`;
- sales copy in prose: "seamless", "robust", "leverage", "cutting-edge" and the like;
- emoji in source, docs or site copy;
- code left behind: a bare `except:`, an `except Exception: pass`, a `print(` in
  the package, a `breakpoint()`, a TODO with no issue number.

Only added lines are read, so the existing tree never fails it. A finding is a
prompt to look again, not a verdict: `unslop: ok` in a trailing comment skips the line.
Exits 1 when anything was found.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass

PROSE = (".md", ".mdx", ".astro", ".ts", ".tsx", ".html", ".yml", ".yaml", ".txt")
CODE = (".py",)
SKIP = (
    "uv.lock",
    "package-lock.json",
    "/vendor/",
    "/node_modules/",
    "src/scripts/unslop.py",
    ".claude/skills/unslop/",
)

ATTRIBUTION = re.compile(
    r"co-authored-by:\s*claude|claude-session:|generated with \[?claude code"
    r"|noreply@anthropic\.com",
    re.IGNORECASE,
)
SALES = re.compile(
    r"\b(seamless(ly)?|robust|leverag(e|es|ing)|cutting[- ]edge|state[- ]of[- ]the[- ]art|"
    r"effortless(ly)?|game[- ]chang(er|ing)|revolutioni[sz]e|supercharge|unlock(s|ing)? the|"
    r"empower(s|ing)?|delve|elevate|best[- ]in[- ]class|world[- ]class|blazing(ly)?[- ]fast|"
    r"in today's|look no further|harness the power)\b",
    re.IGNORECASE,
)
EMOJI = re.compile("[\U0001f300-\U0001faff\u2728\u2b50\u2705]")
BARE_EXCEPT = re.compile(r"^\s*except\s*:")
SWALLOW = re.compile(r"^\s*except\s+(Base)?Exception(\s+as\s+\w+)?\s*:\s*pass\b")
DEBUG = re.compile(r"^\s*(breakpoint\(\)|import pdb|pdb\.set_trace\(\))")
PRINT = re.compile(r"^\s*print\((?!.*file=sys\.stderr)")
TODO = re.compile(r"#\s*(TODO|FIXME|XXX)\b(?!.*#\d)")
WAIVER = "unslop: ok"


@dataclass
class Finding:
    where: str
    rule: str
    line: str

    def __str__(self) -> str:
        return f"{self.where}: {self.rule}: {self.line.strip()[:120]}"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], check=True, capture_output=True, text=True, errors="replace"
    ).stdout


def added_lines(diff: str) -> list[tuple[str, int, str]]:
    """(path, line number, text) for each line the diff adds."""
    lines: list[tuple[str, int, str]] = []
    path, number = "", 0
    for raw in diff.splitlines():
        if raw.startswith("+++ "):
            path = raw[6:] if raw.startswith("+++ b/") else ""
        elif raw.startswith("@@"):
            number = int(re.search(r"\+(\d+)", raw).group(1))  # type: ignore[union-attr]
        elif raw.startswith("+") and path:
            lines.append((path, number, raw[1:]))
            number += 1
        elif not raw.startswith("-"):
            number += 1
    return lines


def check_line(path: str, text: str) -> list[str]:
    if WAIVER in text or any(part in path for part in SKIP):
        return []
    rules = []
    if ATTRIBUTION.search(text):
        rules.append("assistant attribution")
    if path.endswith(PROSE + CODE) and EMOJI.search(text):
        rules.append("emoji")
    if path.endswith(PROSE) and SALES.search(text):
        rules.append(f"sales word {SALES.search(text).group(0)!r}")  # type: ignore[union-attr]
    if path.endswith(CODE):
        if BARE_EXCEPT.search(text):
            rules.append("bare except")
        if SWALLOW.search(text):
            rules.append("exception swallowed with no reason given")
        if DEBUG.search(text):
            rules.append("debugger left in")
        if path.startswith("src/complydoc/") and "/cli/" not in path and PRINT.search(text):
            rules.append("print in the package (use the console or logging)")
        if TODO.search(text):
            rules.append("TODO with no issue number")
    return rules


def check_commits(base: str) -> list[Finding]:
    findings = []
    log = git("log", "--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x1e", f"{base}..HEAD")
    for record in filter(str.strip, log.split("\x1e")):
        sha, author, committer, body = record.strip().split("\x00", 3)
        for who, role in ((author, "author"), (committer, "committer")):
            if ATTRIBUTION.search(who) or who.lower().startswith("claude "):
                findings.append(Finding(sha[:9], f"commit {role} is the assistant", who))
        for line in body.splitlines():
            if ATTRIBUTION.search(line):
                findings.append(Finding(sha[:9], "assistant attribution in message", line))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base", default="origin/development", help="compare against this ref")
    parser.add_argument("--staged", action="store_true", help="read staged lines, not the branch")
    arguments = parser.parse_args()

    if arguments.staged:
        diff, findings = git("diff", "--cached", "-U0"), []
    else:
        base = git("merge-base", arguments.base, "HEAD").strip()
        diff, findings = git("diff", "-U0", base), check_commits(base)

    for path, number, text in added_lines(diff):
        findings.extend(Finding(f"{path}:{number}", rule, text) for rule in check_line(path, text))

    for finding in findings:
        print(finding)
    if findings:
        print(
            f"\n{len(findings)} to look at. Fix them, or add `{WAIVER}` in a comment on the line."
        )
        return 1
    print("Nothing to flag.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
