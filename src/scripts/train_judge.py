"""Train a judge model (`sensitive.judge.model`) from labelled findings.

Each input line is one finding, in the page it was found on:

    {"text": "...", "category": "pt_nif", "start": 120, "end": 129,
     "evidence": "pattern", "label": "business"}

`label` is `none` (not an identifier), `person` or `business`. Write findings from your
own documents with `complydoc scan --format json` plus your labels; nothing here leaves
the machine. Needs scikit-learn, which complydoc itself does not:

    uv run --with scikit-learn python src/scripts/train_judge.py findings.jsonl judge.json

The model is a multinomial logistic regression over `complydoc.sensitive.judge.features`,
written as JSON so that running it needs nothing installed.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from complydoc.sensitive.judge import CLASSES, features


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("findings", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--c", type=float, default=1.0, help="inverse regularisation strength")
    args = parser.parse_args()

    from sklearn.feature_extraction import DictVectorizer
    from sklearn.linear_model import LogisticRegression

    rows = [
        json.loads(line) for line in args.findings.read_text(encoding="utf-8").splitlines() if line
    ]
    x = [features(r["text"], r["category"], r["start"], r["end"], r["evidence"]) for r in rows]
    y = [CLASSES.index(r["label"]) for r in rows]
    missing = sorted(set(range(len(CLASSES))) - set(y))
    if missing:
        raise SystemExit(
            f"no findings labelled {[CLASSES[i] for i in missing]}: the judge needs all three"
        )
    vectorizer = DictVectorizer()
    model = LogisticRegression(C=args.c, max_iter=2000, class_weight="balanced")
    model.fit(vectorizer.fit_transform(x), y)
    weights = {
        name: [round(float(model.coef_[k][i]), 5) for k in range(len(CLASSES))]
        for name, i in vectorizer.vocabulary_.items()
    }
    out = {
        "version": 1,
        "classes": list(CLASSES),
        "bias": [round(float(b), 5) for b in model.intercept_],
        "weights": {k: v for k, v in sorted(weights.items()) if any(abs(w) > 1e-4 for w in v)},
    }
    args.out.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} findings, {len(out['weights'])} features -> {args.out}")


if __name__ == "__main__":
    main()
