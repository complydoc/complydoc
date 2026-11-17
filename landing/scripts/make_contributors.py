"""Write the contributors page's data from GitHub's public API.

Run from the repository root, before a release or whenever someone new is merged:

    python3 landing/scripts/make_contributors.py

- `src/data/contributors.json`: everyone with a commit on the default branch,
  bots left out, in GitHub's order. A snapshot: the page shows it as of the
  day the script ran, and links to GitHub for anything live, such as issues.
- `src/assets/contributors/<login>.png`: each avatar at 96 pixels, so the page
  asks no other site for pictures when it is read.

Set GITHUB_TOKEN to raise the API's hourly limit; nothing else needs it.
"""

from __future__ import annotations

import datetime
import json
import os
import urllib.request
from pathlib import Path

REPO = "complydoc/complydoc"
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


def main() -> None:
    AVATARS.mkdir(parents=True, exist_ok=True)
    people = []
    for contributor in api(f"repos/{REPO}/contributors?per_page=100"):
        if contributor["type"] != "User":
            continue
        login = contributor["login"]
        (AVATARS / f"{login}.png").write_bytes(get(f"{contributor['avatar_url']}&s=96"))
        people.append(
            {
                "login": login,
                "url": contributor["html_url"],
            }
        )
    DATA.write_text(
        json.dumps(
            {
                "as_of": datetime.date.today().isoformat(),
                "contributors": people,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n"
    )
    print(f"{len(people)} contributors")


if __name__ == "__main__":
    main()
