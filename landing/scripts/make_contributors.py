"""Write the contributors page's data from GitHub's public API.

Run from the repository root, before a release or whenever someone new is merged:

    python3 landing/scripts/make_contributors.py

- `src/data/contributors.json`: everyone with a commit on `main` or `development`,
  bots left out, most commits first, each with the subject of their latest commit.
  A snapshot from the day the script ran; the page links to GitHub for anything
  live, such as issues.
- `src/assets/contributors/<login>.png`: each avatar at 96 pixels, so the page
  asks no other site for pictures when it is read.

Set GITHUB_TOKEN to raise the API's hourly limit; nothing else needs it.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path

REPO = "complydoc/complydoc"
BRANCHES = ("main", "development")
LANDING = Path(__file__).resolve().parents[1]
DATA = LANDING / "src" / "data" / "contributors.json"
AVATARS = LANDING / "src" / "assets" / "contributors"


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def api(path: str) -> list | dict:
    return json.loads(get(f"https://api.github.com/{path}"))


def subject(message: str) -> str:
    """A commit's first line, without a conventional prefix or the PR number: "Detect UK NHS numbers"."""
    line = message.splitlines()[0]
    line = re.sub(r"^\w+(\([^)]*\))?!?:\s*", "", line)
    line = re.sub(r"\s*\(#\d+\)$", "", line)
    return line[:1].upper() + line[1:]


def commits(branch: str) -> list[dict]:
    found, page = [], 1
    while True:
        batch = api(f"repos/{REPO}/commits?sha={branch}&per_page=100&page={page}")
        found += batch
        if len(batch) < 100:
            return found
        page += 1


def main() -> None:
    AVATARS.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    people: dict[str, dict] = {}
    for branch in BRANCHES:
        for commit in commits(branch):  # newest first
            author = commit.get("author")
            if not author or author["type"] != "User" or commit["sha"] in seen:
                continue
            seen.add(commit["sha"])
            person = people.setdefault(
                author["login"],
                {"login": author["login"], "url": author["html_url"], "avatar": author["avatar_url"], "commits": 0},
            )
            person["commits"] += 1
            person.setdefault("latest", subject(commit["commit"]["message"]))
    ranked = sorted(people.values(), key=lambda p: -p["commits"])
    for person in ranked:
        (AVATARS / f"{person['login']}.png").write_bytes(get(f"{person.pop('avatar')}&s=96"))
        person.pop("commits")
    DATA.write_text(json.dumps({"contributors": ranked}, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(ranked)} contributors")


if __name__ == "__main__":
    main()
