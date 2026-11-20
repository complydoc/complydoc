"""The decision model: a second look at each finding, in its context, before it is reported.

The patterns and the name model say what a run of characters looks like. The judge reads
where it stands, the words before it on its line, the paragraph around it and its shape,
and says whether it is a person's identifier, a business's (a company's tax number, IBAN
or switchboard), or not an identifier at all (an order number that happens to pass a
checksum, a heading a name model took for a name).

It is off unless configured, and it only ever takes away findings that rest on a shape:

- what a check digit confirmed is never judged, nor a category kept masked even with
  `--reveal` (credentials): a judge that is wrong there costs a leak;
- a business's identifier stays reported unless the team's policy says `business: pass`;
- a judge that cannot be loaded leaves every finding in place, and says why once.

The model is a multinomial logistic regression stored as JSON, so it needs nothing
installed to run and reads in well under a millisecond per finding:

    {"version": 1, "classes": ["none", "person", "business"],
     "bias": [b0, b1, b2], "weights": {"<feature>": [w0, w1, w2], ...}}

`src/scripts/train_judge.py` trains one from labelled findings.
"""

from __future__ import annotations

import json
import logging
import math
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from complydoc.config.schema import JudgeConfig, SensitiveConfig

__all__ = ["Judge", "JudgeModel", "features", "load_judge"]

_LOG = logging.getLogger(__name__)

CLASSES = ("none", "person", "business")

_COMPANY_FORM = re.compile(
    r"(?-i:\b(?:Lda|LDA|Ltd|LTD|Limited|GmbH|S\.?A\.?|S\.L\.?|SARL|Srl|B\.V\.|Inc|LLC|Ltda|AG|"
    r"KG|plc|PLC|SpA|S\.p\.A\.)\b)"
)
_GENERIC_MAILBOX = re.compile(
    r"(?i)\b(?:info|geral|faturacao|facturacion|accounts|contact|contacto|rh|hr|sales|vendas|"
    r"support|suporte|admin|office|billing|financeiro)@"
)
_WORD = re.compile(r"[^\W\d_]{2,}|n\.?º|n°")


def features(text: str, category_id: str, start: int, end: int, evidence: str) -> dict[str, float]:
    """What the judge reads about one finding: its category, its tier, the words before it
    on its line, the words of its paragraph, and its shape."""
    line_start = text.rfind("\n", 0, start) + 1
    prefix = text[line_start:start].lower()
    value = text[start:end]
    block_start = max(text.rfind("\n\n", 0, start), 0)
    block_end = text.find("\n\n", end)
    block = text[block_start : len(text) if block_end < 0 else block_end]
    out: dict[str, float] = {f"cat={category_id}": 1.0, f"ev={evidence}": 1.0}
    for word in _WORD.findall(prefix)[-4:]:
        out[f"pre={word}"] = 1.0
        out[f"pre={category_id}|{word}"] = 1.0
    for word in set(_WORD.findall(block.lower())):
        out[f"blk={word}"] = 0.3
    out["blk_company_form"] = float(bool(_COMPANY_FORM.search(block)))
    out["blk_generic_mailbox"] = float(bool(_GENERIC_MAILBOX.search(block)))
    out["val_generic_mailbox"] = float(bool(_GENERIC_MAILBOX.match(value)))
    shape = re.sub(r"[^\W\d_]", "a", re.sub(r"\d", "9", value))
    out[f"shape={shape[:14]}"] = 1.0
    out["len"] = len(value) / 30
    out["sep"] = float(bool(re.search(r"[ .\-/]", value)))
    return out


@dataclass(frozen=True)
class JudgeModel:
    classes: tuple[str, ...]
    bias: tuple[float, ...]
    weights: dict[str, tuple[float, ...]]

    @classmethod
    def from_json(cls, data: dict[str, object]) -> JudgeModel:
        if data.get("version") != 1:
            raise ValueError(f"judge model version {data.get('version')!r} is not 1")
        classes = tuple(str(c) for c in data["classes"])  # type: ignore[attr-defined]
        if set(classes) != set(CLASSES):
            raise ValueError(f"judge model classes must be {list(CLASSES)}, not {list(classes)}")
        bias = tuple(float(b) for b in data["bias"])  # type: ignore[attr-defined]
        weights = {
            str(k): tuple(float(w) for w in v)
            for k, v in data["weights"].items()  # type: ignore[attr-defined]
        }
        if len(bias) != len(classes) or any(len(w) != len(classes) for w in weights.values()):
            raise ValueError("judge model weights do not match its classes")
        return cls(classes, bias, weights)

    def probabilities(self, found: dict[str, float]) -> dict[str, float]:
        scores = list(self.bias)
        for name, value in found.items():
            row = self.weights.get(name)
            if row is not None:
                for i, weight in enumerate(row):
                    scores[i] += weight * value
        top = max(scores)
        exps = [math.exp(s - top) for s in scores]
        total = sum(exps)
        return {c: e / total for c, e in zip(self.classes, exps, strict=True)}


@lru_cache(maxsize=8)
def _read(path: str) -> JudgeModel:
    return JudgeModel.from_json(json.loads(Path(path).read_text(encoding="utf-8")))


class Judge:
    """The configured judge, ready to rule on one page's findings."""

    def __init__(self, config: JudgeConfig, model: JudgeModel, never_judged: frozenset[str]):
        self.config = config
        self.model = model
        self.never_judged = never_judged

    def drops(self, text: str, category_id: str, start: int, end: int, evidence: str) -> bool:
        """Whether this finding is taken out of the report."""
        if evidence == "confirmed" or category_id in self.never_judged:
            return False
        p = self.model.probabilities(features(text, category_id, start, end, evidence))
        if p["none"] >= self.config.threshold:
            return True
        return (
            self.config.business == "pass"
            and p["business"] >= self.config.threshold
            and p["business"] > p["person"]
        )


_WARNED: set[str] = set()


def load_judge(config: SensitiveConfig) -> Judge | None:
    """The judge the configuration asks for, or None when it is off or cannot be read."""
    judge = config.judge
    if not judge.enabled:
        return None
    if not judge.model:
        reason = "sensitive.judge is enabled but names no model"
    else:
        try:
            return Judge(
                judge,
                _read(str(Path(judge.model).expanduser())),
                frozenset(config.masking.never_reveal),
            )
        except (OSError, ValueError, KeyError, TypeError) as exc:
            reason = f"the judge model {judge.model!r} could not be read: {exc}"
    if reason not in _WARNED:
        _WARNED.add(reason)
        _LOG.warning("%s; every finding is kept", reason)
    return None
