"""Write what complydoc4j is checked against: the Python package's own answers.

    uv run --group integrations python src/scripts/java_conformance.py <golden folder>

complydoc4j's `scripts/update-golden.sh` runs this into its conformance module.

Python is the reference. The Java version reads the same configuration files and has to
give the same answers on the same input, so this writes, into one folder:

- `config/`: the shipped `sensitive.yaml` and `hidden.yaml`, which the Java version
  loads as they are.
- `validators.json`: every validator's verdict on every value in the Python validator
  tests, and on a few thousand generated ones.
- `texts/<fixture>.json`: what `scan_text`, `mask_text` and `find_hidden` make of each
  fixture, and of each of its paragraphs.
- `reports/<fixture>.json`: the report `cd.observe` writes for the fixture run through
  the pipeline both versions build the same way: split at blank lines, embedded by a
  fixed local model, kept in an in-memory store.

The fixtures are the text files in `src/tests/fixtures/java/`.
"""

from __future__ import annotations

import ast
import json
import random
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from complydoc.config.schema import Config
    from complydoc.report.models import ContentFinding
    from complydoc.sensitive.base import SensitiveMatch

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "src" / "tests" / "fixtures" / "java"
CONFIG = ROOT / "src" / "complydoc" / "config"
VALIDATOR_TESTS = ("test_validators.py", "test_international.py", "test_scanner.py")


def _corpus() -> list[str]:
    """Strings from the Python validator tests, and generated ones of every shape the
    validators look at: digits in runs and groups, letters before digits, dates."""
    values: set[str] = set()
    for name in VALIDATOR_TESTS:
        tree = ast.parse((ROOT / "src" / "tests" / "test_sensitive" / name).read_text())
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and 0 < len(node.value) <= 40
                and "\n" not in node.value
            ):
                values.add(node.value)
    rng = random.Random(27)
    for _ in range(3000):
        length = rng.randint(6, 19)
        digits = "".join(rng.choice("0123456789") for _ in range(length))
        values.add(digits)
        cut = rng.randint(1, length - 1)
        values.add(f"{digits[:cut]}{rng.choice(' -./')}{digits[cut:]}")
    for _ in range(500):
        letters = "".join(rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(2))
        values.add(letters + "".join(rng.choice("0123456789") for _ in range(rng.randint(7, 30))))
        values.add("+" + "".join(rng.choice("0123456789") for _ in range(rng.randint(8, 14))))
    for _ in range(300):
        day, month, year = rng.randint(1, 31), rng.randint(1, 12), rng.randint(1890, 2030)
        values.add(f"{day:02d}/{month:02d}/{year}")
        values.add(f"{year}-{month:02d}-{day:02d}")
    return sorted(values)


def _validators() -> dict[str, dict[str, bool]]:
    from complydoc.sensitive.validators import VALIDATORS

    corpus = _corpus()
    # `plausible_dob` depends on today's date: the Java test runs it on the same day or
    # skips it, so it is kept out of the main table.
    return {
        name: {value: bool(check(value)) for value in corpus}
        for name, check in sorted(VALIDATORS.items())
        if name != "plausible_dob"
    }


def _match(match: SensitiveMatch) -> dict[str, object]:
    return {
        "category": match.category,
        "line": match.line,
        "column": match.column,
        "length": match.length,
        "masked": match.masked,
        "evidence": match.evidence,
        "confidence": match.confidence,
        "validators_passed": match.validators_passed,
        "context_term": match.context_term,
        "fingerprint": match.fingerprint,
    }


def _finding(finding: ContentFinding) -> dict[str, object]:
    return {
        "visibility": finding.visibility,
        "instruction": finding.instruction,
        "severity": finding.severity,
        "excerpt": finding.excerpt,
        "characters": finding.characters,
        "hidden_reasons": finding.hidden_reasons,
        "instruction_reasons": finding.instruction_reasons,
        "fingerprint": finding.fingerprint,
    }


def _texts(text: str, config: Config) -> list[dict[str, object]]:
    import complydoc as cd
    from complydoc.observe.trace import _patterns_only
    from complydoc.sensitive.scanner import scan_text

    # The Java version reads no names, so it is checked against the patterns alone, as a
    # trace scans every stage but the documents loaded and what was sent or stored.
    patterns = _patterns_only(config)
    pieces = [text, *[p for p in re.split(r"\n\s*\n", text) if p.strip()]]
    answers = []
    for piece in pieces:
        matches, _ = scan_text(piece, patterns.sensitive)
        answers.append(
            {
                "text": piece,
                "matches": [_match(m) for m in matches],
                "masked": cd.mask_text(piece, config=patterns).text,
                "hidden": [_finding(f) for f in cd.find_hidden(piece, config=patterns)],
            }
        )
    return answers


def _report(fixture: Path, out: Path) -> Path:
    from langchain_core.documents import Document
    from langchain_core.embeddings import DeterministicFakeEmbedding
    from langchain_core.vectorstores import InMemoryVectorStore
    from langchain_text_splitters import TextSplitter

    import complydoc as cd

    class ParagraphSplitter(TextSplitter):
        """Each paragraph a chunk: the splitter the Java side builds the same way."""

        def split_text(self, text: str) -> list[str]:
            return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

    text = fixture.read_text(encoding="utf-8")
    with cd.observe(fixture.stem, out=out) as observation:
        documents = [Document(page_content=text, metadata={"source": fixture.name})]
        chunks = ParagraphSplitter().split_documents(documents)
        InMemoryVectorStore(DeterministicFakeEmbedding(size=8)).add_documents(chunks)
    assert observation.path is not None, observation.error
    return Path(observation.path)


def main(target: str) -> None:
    from complydoc.config.loader import load_config

    out = Path(target)
    for folder in ("config", "texts", "reports"):
        shutil.rmtree(out / folder, ignore_errors=True)
        (out / folder).mkdir(parents=True)
    for name in ("sensitive.yaml", "hidden.yaml"):
        shutil.copyfile(CONFIG / name, out / "config" / name)

    (out / "validators.json").write_text(json.dumps(_validators(), ensure_ascii=False) + "\n")

    config = load_config()
    fixtures = sorted(FIXTURES.glob("*.txt"))
    for fixture in fixtures:
        answers = _texts(fixture.read_text(encoding="utf-8"), config)
        (out / "texts" / f"{fixture.stem}.json").write_text(
            json.dumps(answers, indent=2, ensure_ascii=False) + "\n"
        )
        shutil.copyfile(fixture, out / "texts" / fixture.name)
        with tempfile.TemporaryDirectory() as folder:
            written = _report(fixture, Path(folder))
            shutil.copyfile(written, out / "reports" / f"{fixture.stem}.json")
    print(f"{len(fixtures)} fixtures written to {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: java_conformance.py <folder>")
    main(sys.argv[1])
